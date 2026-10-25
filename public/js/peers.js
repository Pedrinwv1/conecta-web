// Malha WebRTC com "negociação perfeita": ofertas simultâneas (glare) são resolvidas
// pelo papel educado/não educado de cada lado, definido pela comparação dos ids.
const MAX_ICE_RESTARTS = 2;

export class Call {
  constructor({ socket, rtcConfig, localStream, onStream, onPeerAdded, onPeerRemoved, onPeerStatus, onError }) {
    this.socket = socket;
    this.selfId = socket.id;
    this.rtcConfig = rtcConfig;
    this.localStream = localStream;
    this.audioTrack = localStream?.getAudioTracks()[0] ?? null;
    this.videoTrack = localStream?.getVideoTracks()[0] ?? null; // câmera ou tela atual
    this.cb = { onStream, onPeerAdded, onPeerRemoved, onPeerStatus, onError };
    this.peers = new Map();
    this.stopped = false;
  }

  addPeer(id, name) {
    if (this.stopped || !id || id === this.selfId) return null;
    const existing = this.peers.get(id);
    if (existing) {
      if (name && existing.name !== name) { existing.name = name; this.cb.onPeerAdded(existing); }
      return existing; // nunca cria conexão duplicada
    }
    const pc = new RTCPeerConnection(this.rtcConfig);
    const peer = {
      id, name: name || 'Participante', pc, polite: this.selfId < id,
      makingOffer: false, ignoreOffer: false, restarts: 0, queue: Promise.resolve(),
      remoteStream: new MediaStream(), senders: {},
    };
    const streams = this.localStream ? [this.localStream] : [];
    peer.senders.audio = pc.addTransceiver(this.audioTrack ?? 'audio', { direction: 'sendrecv', streams }).sender;
    peer.senders.video = pc.addTransceiver(this.videoTrack ?? 'video', { direction: 'sendrecv', streams }).sender;
    this.peers.set(id, peer);
    this.#wire(peer);
    this.cb.onPeerAdded(peer);
    this.cb.onPeerStatus(id, 'connecting');
    return peer;
  }

  #wire(peer) {
    const { pc, id } = peer;
    pc.ontrack = ({ track }) => {
      if (!peer.remoteStream.getTracks().includes(track)) peer.remoteStream.addTrack(track);
      this.cb.onStream(id, peer.remoteStream);
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.#send({ to: id, candidate: candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.#send({ to: id, description: pc.localDescription.toJSON() });
      } catch (err) {
        this.cb.onError(err, 'negotiation');
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected': peer.restarts = 0; this.cb.onPeerStatus(id, 'connected'); break;
        case 'disconnected': this.cb.onPeerStatus(id, 'reconnecting'); break;
        case 'failed':
          if (peer.restarts < MAX_ICE_RESTARTS && !this.stopped) {
            peer.restarts += 1;
            this.cb.onPeerStatus(id, 'reconnecting');
            pc.restartIce();
          } else {
            this.cb.onPeerStatus(id, 'failed');
            this.cb.onError(new Error('Falha ao estabelecer conexão WebRTC.'), 'connection', peer);
          }
          break;
        default: break;
      }
    };
  }

  #send(payload) {
    if (!this.stopped) this.socket.emit('signal', payload);
  }

  handleSignal({ from, description, candidate }) {
    if (this.stopped || typeof from !== 'string') return;
    const peer = this.peers.get(from) ?? this.addPeer(from, null); // sinal pode chegar antes de "peer:joined"
    if (!peer) return;
    // Fila por participante: garante ordem entre descrição e candidatos ICE.
    peer.queue = peer.queue.then(() => this.#process(peer, description, candidate))
      .catch((err) => this.cb.onError(err, 'signal', peer));
  }

  async #process(peer, description, candidate) {
    const { pc } = peer;
    if (peer.pcClosed || pc.signalingState === 'closed') return;
    if (description) {
      const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        this.#send({ to: peer.id, description: pc.localDescription.toJSON() });
      }
    } else if (candidate) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        if (!peer.ignoreOffer) throw err;
      }
    }
  }

  removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.#close(peer);
    this.peers.delete(id);
    this.cb.onPeerRemoved(id);
  }

  #close(peer) {
    peer.pcClosed = true;
    peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onnegotiationneeded = peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }

  async setLocalVideoTrack(track) {
    this.videoTrack = track;
    await Promise.all([...this.peers.values()].map((peer) =>
      peer.senders.video.replaceTrack(track).catch((err) => this.cb.onError(err, 'replaceTrack', peer))));
  }

  stop() {
    this.stopped = true;
    for (const peer of this.peers.values()) this.#close(peer);
    this.peers.clear();
  }
}
