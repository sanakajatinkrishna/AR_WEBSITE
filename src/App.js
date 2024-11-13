// App.js
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class ImageMatcher {
  constructor() {
    this.referenceImage = null;
    this.referenceFeatures = null;
    this.matchThreshold = 0.65;
  }

  async initialize(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const img = await createImageBitmap(blob);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      this.referenceImage = ctx.getImageData(0, 0, img.width, img.height);
      this.referenceFeatures = this.extractFeatures(this.referenceImage);
      return true;
    } catch (error) {
      console.error('Reference image initialization failed:', error);
      return false;
    }
  }

  extractFeatures(imageData) {
    const features = [];
    const { width, height, data } = imageData;
    const cellSize = 20; // Grid cell size for feature extraction

    for (let y = cellSize; y < height - cellSize; y += cellSize) {
      for (let x = cellSize; x < width - cellSize; x += cellSize) {
        const descriptor = this.computeLocalDescriptor(data, width, x, y, cellSize);
        if (descriptor) {
          features.push({ x, y, descriptor });
        }
      }
    }
    return features;
  }

  computeLocalDescriptor(data, width, centerX, centerY, cellSize) {
    const descriptor = new Float32Array(64);
    let descriptorIndex = 0;
    let hasSignificantFeature = false;

    for (let dy = -cellSize/2; dy <= cellSize/2; dy += cellSize/4) {
      for (let dx = -cellSize/2; dx <= cellSize/2; dx += cellSize/4) {
        const x = centerX + dx;
        const y = centerY + dy;
        const idx = (y * width + x) * 4;

        // Compute gradients
        const dx1 = data[idx + 4] - data[idx - 4];
        const dy1 = data[idx + width * 4] - data[idx - width * 4];
        
        const gradient = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const orientation = Math.atan2(dy1, dx1);

        descriptor[descriptorIndex++] = gradient;
        descriptor[descriptorIndex++] = orientation;

        if (gradient > 25) {
          hasSignificantFeature = true;
        }
      }
    }

    return hasSignificantFeature ? descriptor : null;
  }

  matchFrame(currentFrame) {
    if (!this.referenceFeatures || !currentFrame) {
      return { matched: false };
    }

    const currentFeatures = this.extractFeatures(currentFrame);
    const matches = [];

    for (const cf of currentFeatures) {
      let bestMatch = { distance: Infinity, feature: null };
      let secondBest = { distance: Infinity };

      for (const rf of this.referenceFeatures) {
        const distance = this.computeDistance(cf.descriptor, rf.descriptor);
        
        if (distance < bestMatch.distance) {
          secondBest.distance = bestMatch.distance;
          bestMatch = { distance, feature: rf };
        } else if (distance < secondBest.distance) {
          secondBest.distance = distance;
        }
      }

      if (bestMatch.distance < this.matchThreshold * secondBest.distance) {
        matches.push({
          current: cf,
          reference: bestMatch.feature
        });
      }
    }

    if (matches.length >= 8) {
      const { x, y, scale } = this.computeTransformation(matches, currentFrame);
      return {
        matched: true,
        position: { x, y },
        scale: scale,
        confidence: matches.length / Math.min(currentFeatures.length, this.referenceFeatures.length)
      };
    }

    return { matched: false };
  }

  computeDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
      const diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  computeTransformation(matches, currentFrame) {
    let sumX = 0, sumY = 0;
    matches.forEach(match => {
      sumX += match.current.x;
      sumY += match.current.y;
    });

    const centerX = sumX / matches.length;
    const centerY = sumY / matches.length;

    return {
      x: (centerX / currentFrame.width) * 100,
      y: (centerY / currentFrame.height) * 100,
      scale: 1.0
    };
  }
}

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const imageMatcher = useRef(new ImageMatcher());

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 40, height: 40 });
  const [matchConfidence, setMatchConfidence] = useState(0);
  const [isCanvasDetected, setIsCanvasDetected] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Verifying content...');
        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          setDebugInfo('Invalid or inactive content');
          return;
        }

        const data = snapshot.docs[0].data();
        setVideoUrl(data.videoUrl);
        
        const initialized = await imageMatcher.current.initialize(data.imageUrl);
        if (initialized) {
          setDebugInfo('Ready - Show image marker');
        } else {
          setDebugInfo('Failed to initialize image matching');
        }
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing with sound');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Tap to enable sound');
      
      const playOnTap = async () => {
        try {
          await overlayVideoRef.current?.play();
          setIsVideoPlaying(true);
          setDebugInfo('Video playing with sound');
          document.removeEventListener('click', playOnTap);
        } catch (err) {
          console.error('Playback error:', err);
        }
      };
      
      document.addEventListener('click', playOnTap);
    }
  }, [videoUrl, isVideoPlaying]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    context.drawImage(video, 0, 0);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const result = imageMatcher.current.matchFrame(currentFrame);
    if (result.matched) {
      setIsCanvasDetected(true);
      setMatchConfidence(result.confidence);
      setCanvasPosition(result.position);
      setCanvasSize({
        width: Math.min(40 * result.scale, 60),
        height: Math.min(40 * result.scale, 60)
      });

      if (!isVideoPlaying) {
        startVideo();
      }
    } else {
      setIsCanvasDetected(false);
      setMatchConfidence(0);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [startVideo, isVideoPlaying]);

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera ready - Show image marker');
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    if (videoUrl) {
      startCamera();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame, videoUrl]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black'
    },
    video: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'none'
    },
    overlayVideo: {
      position: 'absolute',
      top: `${canvasPosition.y}%`,
      left: `${canvasPosition.x}%`,
      transform: 'translate(-50%, -50%)',
      width: `${canvasSize.width}vw`,
      height: `${canvasSize.height}vh`,
      objectFit: 'contain',
      zIndex: 20,
      transition: 'all 0.1s ease-out'
    },
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    }
  };

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />
      
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

      {videoUrl && (
        <video
          ref={overlayVideoRef}
          style={styles.overlayVideo}
          autoPlay
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Key: {contentKey || 'Not found'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Marker Detected: {isCanvasDetected ? 'Yes' : 'No'}</div>
        <div>Match Confidence: {(matchConfidence * 100).toFixed(1)}%</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};

export default App;