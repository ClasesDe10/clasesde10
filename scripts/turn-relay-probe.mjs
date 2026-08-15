#!/usr/bin/env node

import { chromium } from 'playwright';

const servers = [
  { label: 'metered-ip-udp-80', urls: 'turn:15.235.47.158:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { label: 'metered-ip-tcp-443', urls: 'turn:15.235.47.158:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { label: 'metered-udp-80', urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { label: 'metered-tcp-443', urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { label: 'metered-tls-443', urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { label: 'freestun-3478', urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
  { label: 'freestun-tls-5349', urls: 'turns:freestun.net:5349', username: 'free', credential: 'free' },
  { label: 'freeturn-3479', urls: 'turn:freeturn.net:3479', username: 'free', credential: 'free' },
  { label: 'freeturn-tls-5350', urls: 'turns:freeturn.net:5350', username: 'free', credential: 'free' },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
try {
  const page = await browser.newPage();
  await page.goto('https://clasesde10.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const results = [];
  for (const server of servers) {
    const result = await page.evaluate(async (iceServer) => {
      const peer = new RTCPeerConnection({ iceServers: [iceServer], iceTransportPolicy: 'relay' });
      const candidates = [];
      const errors = [];
      peer.createDataChannel('probe');
      peer.addEventListener('icecandidate', (event) => {
        if (event.candidate) candidates.push({ type: event.candidate.type, protocol: event.candidate.protocol, url: event.candidate.url || '' });
      });
      peer.addEventListener('icecandidateerror', (event) => errors.push({ code: event.errorCode, text: event.errorText, url: event.url || '' }));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 12000);
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      peer.close();
      return { candidates, errors };
    }, server);
    results.push({ label: server.label, ...result });
  }
  console.log(JSON.stringify({ ok: results.some((item) => item.candidates.some((candidate) => candidate.type === 'relay')), results }, null, 2));
} finally {
  await browser.close();
}
