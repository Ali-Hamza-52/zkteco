export const ZK_TCP_PREFIX = Buffer.from([
  0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00,
]);

export const USHRT_MAX = 65535;
export const MAX_CHUNK = 65472;

export const COMMANDS = {
  CMD_CONNECT: 1000,
  CMD_EXIT: 1001,
  CMD_AUTH: 1102,
  CMD_PREPARE_DATA: 1500,
  CMD_DATA: 1501,
  CMD_FREE_DATA: 1502,
  CMD_DATA_WRRQ: 1503,
  CMD_DATA_RDY: 1504,
  CMD_ACK_OK: 2000,
} as const;

export const REQUEST_DATA = {
  GET_ATTENDANCE_LOGS: Buffer.from([
    0x01, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]),
} as const;

