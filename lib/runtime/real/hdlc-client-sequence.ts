/**
 * Client HDLC I-frame control progression matching Gurux `GXDLMSSettings.getNextSend`
 * after `resetFrameSequence()` (client sender starts 0xFE, receiver 0x0E).
 */

export type ClientHdlcIframeSeqState = {
  senderFrame: number
  receiverFrame: number
}

const CLIENT_START_SENDER = 0xfe
const CLIENT_START_RECEIVER = 0x0e

export function createClientHdlcIframeState(): ClientHdlcIframeSeqState {
  return { senderFrame: CLIENT_START_SENDER, receiverFrame: CLIENT_START_RECEIVER }
}

function increaseReceiverSequence(value: number): number {
  return ((((value & 0xff) + 0x20) | 0x10) | (value & 0xe)) & 0xff
}

function increaseSendSequence(value: number): number {
  return ((value & 0xf0) | ((value + 2) & 0xe)) & 0xff
}

/** Gurux `getNextSend(true)` — first client I-frame after UA (e.g. first AARQ segment). */
export function clientIframeControlFirstSend(state: ClientHdlcIframeSeqState): number {
  state.senderFrame = increaseReceiverSequence(increaseSendSequence(state.senderFrame))
  return state.senderFrame & 0xff
}

/** Gurux `getNextSend(false)` — control for subsequent segments / I-frames. */
export function clientIframeControlAdvanceSend(state: ClientHdlcIframeSeqState): number {
  state.senderFrame = increaseSendSequence(state.senderFrame)
  return state.senderFrame & 0xff
}
