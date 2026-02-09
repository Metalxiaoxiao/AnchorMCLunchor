export enum IsolationMode {
  ALL = 'all',
  MODDED = 'modded',
  SNAPSHOT = 'snapshot',
  MODDED_AND_SNAPSHOT = 'modded_and_snapshot',
  NONE = 'none'
}

export const ISOLATION_MODES = [
  { value: IsolationMode.ALL, label: '全部版本隔离' },
  { value: IsolationMode.MODDED, label: '隔离可安装 Mod 的版本' },
  { value: IsolationMode.SNAPSHOT, label: '隔离非正式版 (快照/预览)' },
  { value: IsolationMode.MODDED_AND_SNAPSHOT, label: '隔离可安装 Mod 的版本和非正式版' },
  { value: IsolationMode.NONE, label: '关闭版本隔离' }
];

export function shouldIsolate(mode: IsolationMode, isModded: boolean, versionType: string): boolean {
  switch (mode) {
    case IsolationMode.ALL:
      return true;
    case IsolationMode.MODDED:
      return isModded;
    case IsolationMode.SNAPSHOT:
      return versionType !== 'release';
    case IsolationMode.MODDED_AND_SNAPSHOT:
      return isModded || versionType !== 'release';
    case IsolationMode.NONE:
      return false;
    default:
      return false;
  }
}
