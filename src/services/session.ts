import { ipc } from "@/lib/ipc";

export const session = {
  get isDesktop() {
    return ipc.isTauri;
  },
  listDocuments: (...args: Parameters<typeof ipc.listDocuments>) => ipc.listDocuments(...args),
  newDocument: (...args: Parameters<typeof ipc.newDocument>) => ipc.newDocument(...args),
  openContent: (...args: Parameters<typeof ipc.openContent>) => ipc.openContent(...args),
  openFileDialog: (...args: Parameters<typeof ipc.openFileDialog>) => ipc.openFileDialog(...args),
  openPath: (...args: Parameters<typeof ipc.openPath>) => ipc.openPath(...args),
  saveFile: (...args: Parameters<typeof ipc.saveFile>) => ipc.saveFile(...args),
  saveFileDialog: (...args: Parameters<typeof ipc.saveFileDialog>) => ipc.saveFileDialog(...args),
  exportBundleDialog: (...args: Parameters<typeof ipc.exportBundleDialog>) => ipc.exportBundleDialog(...args),
  installLayout: (...args: Parameters<typeof ipc.installLayout>) => ipc.installLayout(...args),
  closeDocument: (...args: Parameters<typeof ipc.closeDocument>) => ipc.closeDocument(...args),
  renameDocument: (...args: Parameters<typeof ipc.renameDocument>) => ipc.renameDocument(...args),
  duplicateDocument: (...args: Parameters<typeof ipc.duplicateDocument>) => ipc.duplicateDocument(...args),
  getSnapshot: (...args: Parameters<typeof ipc.getSnapshot>) => ipc.getSnapshot(...args),
  validate: (...args: Parameters<typeof ipc.validate>) => ipc.validate(...args),
  modifierMapView: (...args: Parameters<typeof ipc.modifierMapView>) => ipc.modifierMapView(...args),
  setKeyOutput: (...args: Parameters<typeof ipc.setKeyOutput>) => ipc.setKeyOutput(...args),
  clearKey: (...args: Parameters<typeof ipc.clearKey>) => ipc.clearKey(...args),
  makeKeyDead: (...args: Parameters<typeof ipc.makeKeyDead>) => ipc.makeKeyDead(...args),
  unlinkKey: (...args: Parameters<typeof ipc.unlinkKey>) => ipc.unlinkKey(...args),
  relinkKey: (...args: Parameters<typeof ipc.relinkKey>) => ipc.relinkKey(...args),
  swapKeys: (...args: Parameters<typeof ipc.swapKeys>) => ipc.swapKeys(...args),
  repair: (...args: Parameters<typeof ipc.repair>) => ipc.repair(...args),
  undo: (...args: Parameters<typeof ipc.undo>) => ipc.undo(...args),
  redo: (...args: Parameters<typeof ipc.redo>) => ipc.redo(...args),
};
