import { MAX_CHUNK, USHRT_MAX, ZK_TCP_PREFIX } from './zk-constants';

export function createChecksum(buf: Buffer): number {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i] ?? 0;
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= USHRT_MAX;
  }
  chksum = USHRT_MAX - chksum - 1;
  return chksum;
}

export function createTcpPayload(
  command: number,
  sessionId: number,
  replyId: number,
  data: Buffer,
) {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  data.copy(buf, 8);

  const chksum = createChecksum(buf);
  buf.writeUInt16LE(chksum, 2);

  const nextReply = (replyId + 1) % USHRT_MAX;
  buf.writeUInt16LE(nextReply, 6);

  return buf;
}

export function wrapTcp(buf: Buffer) {
  const prefix = Buffer.from(ZK_TCP_PREFIX);
  prefix.writeUInt16LE(buf.length, 4);
  return Buffer.concat([prefix, buf]);
}

export function unwrapTcp(buf: Buffer) {
  if (buf.length < 8) return buf;
  if (buf.subarray(0, 4).compare(ZK_TCP_PREFIX.subarray(0, 4)) !== 0) return buf;
  return buf.subarray(8);
}

export function decodeTcpHeader(raw: Buffer) {
  const payloadSize = raw.readUInt16LE(4);
  const payload = raw.subarray(8, 16);
  const commandId = payload.readUInt16LE(0);
  const sessionId = payload.readUInt16LE(4);
  const replyId = payload.readUInt16LE(6);
  return { payloadSize, commandId, sessionId, replyId };
}

export function parseZkTimeToDate(time: number) {
  let t = time;
  const second = t % 60;
  t = (t - second) / 60;
  const minute = t % 60;
  t = (t - minute) / 60;
  const hour = t % 24;
  t = (t - hour) / 24;
  const day = (t % 31) + 1;
  t = (t - (day - 1)) / 31;
  const month = t % 12;
  t = (t - month) / 12;
  const year = t + 2000;
  return new Date(year, month, day, hour, minute, second);
}

export type AttendanceRecord = {
  userSn?: number;
  deviceUserId?: string;
  recordTime: Date;
};

export function decodeRecordData40(recordData: Buffer): AttendanceRecord {
  const userSn = recordData.readUInt16LE(0);
  const deviceUserId = recordData
    .subarray(2, 11)
    .toString('ascii')
    .split('\0')[0];
  const recordTime = parseZkTimeToDate(recordData.readUInt32LE(27));
  return { userSn, deviceUserId, recordTime };
}

export function splitIntoChunks(totalSize: number) {
  const remain = totalSize % MAX_CHUNK;
  const numberChunks = Math.round(totalSize - remain) / MAX_CHUNK;
  const totalPackets = numberChunks + (remain > 0 ? 1 : 0);
  return { remain, numberChunks, totalPackets };
}

