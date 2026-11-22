// Testet das injizierte Hook-Skript der Android-WebView in jsdom.
import { readFileSync } from 'node:fs';

const hook = readFileSync('android/app/src/main/assets/export-hook.js', 'utf8');
const sent: { name: string; mime: string; b64: string }[] = [];

function install() {
  sent.length = 0;
  (window as any).__radreiseHooked = false;
  (window as any).RadreiseNative = { onFile: (name: string, mime: string, b64: string) => sent.push({ name, mime, b64 }) };
  (URL as any).createObjectURL = (b: Blob) => 'blob:test/' + Math.random();
  new Function(hook)();
}
const wait = () => new Promise((r) => setTimeout(r, 50));

describe('export-hook.js', () => {
  beforeEach(install);

  it('fängt FileSaver-Stil ab (losgelöster Anker + dispatchEvent)', async () => {
    const blob = new Blob(['<gpx/>'], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'route.gpx';
    a.dispatchEvent(new MouseEvent('click'));
    await wait();
    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe('route.gpx');
    expect(atob(sent[0].b64)).toBe('<gpx/>');
  });

  it('fängt a.click() ab', async () => {
    const url = URL.createObjectURL(new Blob(['abc']));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x.gpx';
    a.click();
    await wait();
    expect(sent.length).toBe(1);
  });

  it('fängt echten Klick auf eingebauten Anker ab, ohne doppelt zu senden', async () => {
    const url = URL.createObjectURL(new Blob(['abc']));
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'y.gpx');
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait();
    expect(sent.length).toBe(1);
  });

  it('ignoriert normale Links', async () => {
    const a = document.createElement('a');
    a.href = 'https://example.org/';
    a.download = 'z';
    a.dispatchEvent(new MouseEvent('click'));
    await wait();
    expect(sent.length).toBe(0);
  });
});
