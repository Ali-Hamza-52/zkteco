import net from 'net';
import { COMMANDS, MAX_CHUNK, REQUEST_DATA } from './zk-constants';
import {
  AttendanceRecord,
  createTcpPayload,
  decodeRecordData40,
  decodeTcpHeader,
  splitIntoChunks,
  unwrapTcp,
  wrapTcp,
} from './zk-utils';

type ZkTcpClientOptions = {
  ip: string;
  port: number;
  timeoutMs: number;
  commKey?: number;
};

export class ZkTcpClient {
  private socket: net.Socket | null = null;
  private sessionId = 0;
  private replyId = 0;

  constructor(private readonly options: ZkTcpClientOptions) {}

  async connect() {
    if (this.socket) return;

    this.socket = new net.Socket();
    this.socket.setTimeout(this.options.timeoutMs);

    await new Promise<void>((resolve, reject) => {
      const s = this.socket!;
      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        s.off('error', onError);
        s.off('connect', onConnect);
      };
      s.once('error', onError);
      s.once('connect', onConnect);
      s.connect(this.options.port, this.options.ip);
    });

    this.sessionId = 0;
    this.replyId = 0;

    const reply = await this.executeCmd(COMMANDS.CMD_CONNECT, Buffer.alloc(0));
    if (reply.length >= 6) {
      this.sessionId = reply.readUInt16LE(4);
    }

    const commKey = this.options.commKey ?? 0;
    if (commKey && Number.isFinite(commKey) && commKey > 0) {
      const authBuf = Buffer.alloc(4);
      authBuf.writeUInt32LE(commKey, 0);
      await this.executeCmd(COMMANDS.CMD_AUTH, authBuf);
    }
  }

  async disconnect() {
    if (!this.socket) return;
    try {
      await this.executeCmd(COMMANDS.CMD_EXIT, Buffer.alloc(0));
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      const s = this.socket!;
      s.end(() => resolve());
      setTimeout(() => resolve(), 1000);
    });
    this.socket = null;
  }

  private async writeAndReadOnce(buf: Buffer, timeoutMs: number) {
    const s = this.socket;
    if (!s) throw new Error('SOCKET_NOT_CONNECTED');

    return await new Promise<Buffer>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        s.off('data', onData);
        s.off('error', onError);
      };

      const onData = (data: Buffer) => {
        cleanup();
        resolve(data);
      };

      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      s.once('data', onData);
      s.once('error', onError);
      s.write(buf, (err) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('TIMEOUT_WAITING_REPLY'));
        }, timeoutMs);
      });
    });
  }

  private async executeCmd(command: number, data: Buffer) {
    if (!this.socket) throw new Error('SOCKET_NOT_CONNECTED');

    if (command === COMMANDS.CMD_CONNECT) {
      this.sessionId = 0;
      this.replyId = 0;
    } else {
      this.replyId++;
    }

    const payload = createTcpPayload(command, this.sessionId, this.replyId, data);
    const buf = wrapTcp(payload);
    const replyWrapped = await this.writeAndReadOnce(buf, this.options.timeoutMs);
    return unwrapTcp(replyWrapped);
  }

  private sendChunkRequest(start: number, size: number) {
    if (!this.socket) throw new Error('SOCKET_NOT_CONNECTED');
    this.replyId++;
    const reqData = Buffer.alloc(8);
    reqData.writeUInt32LE(start, 0);
    reqData.writeUInt32LE(size, 4);
    const payload = createTcpPayload(
      COMMANDS.CMD_DATA_RDY,
      this.sessionId,
      this.replyId,
      reqData,
    );
    this.socket.write(wrapTcp(payload));
  }

  private async readWithBuffer(reqData: Buffer) {
    if (!this.socket) throw new Error('SOCKET_NOT_CONNECTED');

    this.replyId++;
    const payload = createTcpPayload(
      COMMANDS.CMD_DATA_WRRQ,
      this.sessionId,
      this.replyId,
      reqData,
    );

    const firstReplyWrapped = await this.writeAndReadOnce(
      wrapTcp(payload),
      this.options.timeoutMs,
    );

    const firstReply = Buffer.from(firstReplyWrapped);
    const header = decodeTcpHeader(firstReply.subarray(0, 16));
    const unwrapped = unwrapTcp(firstReply);

    if (header.commandId === COMMANDS.CMD_DATA) {
      return { data: unwrapped.subarray(8) };
    }

    if (
      header.commandId === COMMANDS.CMD_ACK_OK ||
      header.commandId === COMMANDS.CMD_PREPARE_DATA
    ) {
      const recvData = firstReply.subarray(16);
      const size = recvData.readUIntLE(1, 4);
      const { remain, numberChunks } = splitIntoChunks(size);

      const totalExpectedPackets = numberChunks + (remain > 0 ? 1 : 0);
      let remainingPackets = totalExpectedPackets;

      let replyData = Buffer.from([]);
      let totalBuffer = Buffer.from([]);
      let realTotalBuffer = Buffer.from([]);

      await new Promise<void>((resolve, reject) => {
        const s = this.socket!;
        let timer: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          s.off('data', onData);
        };

        const resetTimer = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cleanup();
            reject(new Error('TIMEOUT_RECEIVING_CHUNKS'));
          }, Math.max(this.options.timeoutMs, 8000));
        };

        const onData = (chunk: Buffer) => {
          resetTimer();
          totalBuffer = Buffer.concat([totalBuffer, chunk]);

          while (totalBuffer.length >= 8) {
            const packetLen = totalBuffer.readUInt16LE(4);
            const needed = 8 + packetLen;
            if (totalBuffer.length < needed) break;

            const packet = totalBuffer.subarray(0, needed);
            totalBuffer = totalBuffer.subarray(needed);

            const packetPayload = unwrapTcp(packet);
            const zkData = packetPayload.subarray(8);
            realTotalBuffer = Buffer.concat([realTotalBuffer, zkData]);

            if (
              (remainingPackets > 1 &&
                realTotalBuffer.length === MAX_CHUNK + 8) ||
              (remainingPackets === 1 &&
                realTotalBuffer.length === remain + 8) ||
              (remain === 0 &&
                remainingPackets === 1 &&
                realTotalBuffer.length === MAX_CHUNK + 8)
            ) {
              replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)]);
              realTotalBuffer = Buffer.from([]);
              remainingPackets -= 1;
              if (remainingPackets <= 0) {
                cleanup();
                resolve();
                return;
              }
            }
          }
        };

        s.on('data', onData);
        resetTimer();

        for (let i = 0; i <= numberChunks; i++) {
          if (i === numberChunks) {
            this.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
          } else {
            this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
          }
        }
      });

      return { data: replyData };
    }

    throw new Error(`UNHANDLED_COMMAND_ID_${header.commandId}`);
  }

  async getAttendances(): Promise<AttendanceRecord[]> {
    if (!this.socket) await this.connect();

    await this.executeCmd(COMMANDS.CMD_FREE_DATA, Buffer.alloc(0));
    const data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS);
    await this.executeCmd(COMMANDS.CMD_FREE_DATA, Buffer.alloc(0));

    const RECORD_PACKET_SIZE = 40;
    let recordData = data.data.subarray(4);
    const records: AttendanceRecord[] = [];
    while (recordData.length >= RECORD_PACKET_SIZE) {
      records.push(decodeRecordData40(recordData.subarray(0, RECORD_PACKET_SIZE)));
      recordData = recordData.subarray(RECORD_PACKET_SIZE);
    }
    return records;
  }
}

