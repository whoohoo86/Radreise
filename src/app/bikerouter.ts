import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportedFile {
  filename: string;
  mime: string;
  text: string;
}

/** Native Android-Plugin, siehe android/app/src/main/java/de/fabian/radreise/BikerouterPlugin.java */
export interface BikerouterPlugin {
  open(options: Bounds & { url: string }): Promise<void>;
  setBounds(bounds: Bounds): Promise<void>;
  setVisible(options: { visible: boolean }): Promise<void>;
  close(): Promise<void>;
  addListener(event: 'fileExported', cb: (file: ExportedFile) => void): Promise<PluginListenerHandle>;
  addListener(event: 'closeRequested', cb: () => void): Promise<PluginListenerHandle>;
}

export const Bikerouter = registerPlugin<BikerouterPlugin>('Bikerouter');
export const BIKEROUTER_URL = 'https://bikerouter.de/';
