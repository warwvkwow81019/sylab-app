import React from 'react';

// Safe wrapper for expo-video to prevent module-level crash
let _videoModule: any = null;
let _loadAttempted = false;

function tryLoadVideo() {
  if (_loadAttempted) return _videoModule;
  _loadAttempted = true;
  try {
    _videoModule = require("expo-video");
  } catch (e) {
    console.warn("[SafeVideo] expo-video not available:", e);
    _videoModule = null;
  }
  return _videoModule;
}

export function getUseVideoPlayer() {
  const mod = tryLoadVideo();
  return mod?.useVideoPlayer ?? null;
}

export function getVideoView(): React.ComponentType<any> | null {
  const mod = tryLoadVideo();
  return mod?.VideoView ?? null;
}
