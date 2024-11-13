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
    this.minMatches = 6;
    this.lastMatchPosition = null;
    this.smoothingFactor = 0.7;
    this.scales = [0.5, 0.75, 1.0, 1.25, 1.5];
    this.gridSize = 10;
    this.maxFeatures = 200;
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
      console.log('Reference features extracted:', this.referenceFeatures.length);
      return true;
    } catch (error) {
      console.error('Reference image initialization failed:', error);
      return false;
    }
  }

  extractFeatures(imageData) {
    const features = [];
    const { width, height, data } = imageData;

    for (let y = this.gridSize; y < height - this.gridSize; y += this.gridSize) {
      for (let x = this.gridSize; x < width - this.gridSize; x += this.gridSize) {
        const descriptor = this.computeDescriptor(data, width, x, y);
        if (descriptor) {
          features.push({
            x,
            y,
            descriptor,
            strength: this.computeFeatureStrength(data, width, x, y)
          });
        }
      }
    }

    // Sort by strength and keep top features
    features.sort((a, b) => b.strength - a.strength);
    return features.slice(0, this.maxFeatures);
  }

  computeDescriptor(data, width, centerX, centerY) {
    const descriptor = new Float32Array(128);
    let idx = 0;
    let hasSignificantGradient = false;

    for (let dy = -this.gridSize; dy <= this.gridSize; dy += 4) {
      for (let dx = -this.gridSize; dx <= this.gridSize; dx += 4) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        const gradX = this.getGradientX(data, width, x, y);
        const gradY = this.getGradientY(data, width, x, y);
        
        const magnitude = Math.sqrt(gradX * gradX + gradY * gradY);
        const orientation = Math.atan2(gradY, gradX);

        descriptor[idx++] = magnitude;
        descriptor[idx++] = orientation;

        if (magnitude > 25) {
          hasSignificantGradient = true;
        }
      }
    }

    return hasSignificantGradient ? descriptor : null;
  }

  getGradientX(data, width, x, y) {
    const idx = (y * width + x) * 4;
    return (data[idx + 4] || 0) - (data[idx - 4] || 0);
  }

  getGradientY(data, width, x, y) {
    const idx = (y * width + x) * 4;
    return (data[idx + width * 4] || 0) - (data[idx - width * 4] || 0);
  }

  computeFeatureStrength(data, width, x, y) {
    let sum = 0;
    const size = this.gridSize;
    
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const gradX = this.getGradientX(data, width, x + dx, y + dy);
        const gradY = this.getGradientY(data, width, x + dx, y + dy);
        sum += Math.sqrt(gradX * gradX + gradY * gradY);
      }
    }
    
    return sum;
  }

  matchFrame(currentFrame) {
    if (!this.referenceFeatures || !currentFrame) {
      return { matched: false };
    }

    let bestMatch = { matched: false, confidence: 0 };

    for (const scale of this.scales) {
      const scaledFeatures = this.extractScaledFeatures(currentFrame, scale);
      const matchResult = this.matchFeaturesAtScale(scaledFeatures, currentFrame, scale);
      
      if (matchResult.matched && matchResult.confidence > bestMatch.confidence) {
        bestMatch = matchResult;
      }
    }

    if (bestMatch.matched) {
      // Apply position smoothing
      if (this.lastMatchPosition) {
        bestMatch.position = {
          x: this.lastMatchPosition.x * this.smoothingFactor + 
             bestMatch.position.x * (1 - this.smoothingFactor),
          y: this.lastMatchPosition.y * this.smoothingFactor + 
             bestMatch.position.y * (1 - this.smoothingFactor)
        };
      }
      this.lastMatchPosition = bestMatch.position;
    }

    return bestMatch;
  }

  extractScaledFeatures(frame, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(frame.width * scale);
    canvas.height = Math.round(frame.height * scale);
    
    const ctx = canvas.getContext('2d');
    const scaledImage = document.createElement('canvas');
    scaledImage.width = frame.width;
    scaledImage.height = frame.height;
    scaledImage.getContext('2d').putImageData(frame, 0, 0);
    
    ctx.drawImage(scaledImage, 0, 0, canvas.width, canvas.height);
    return this.extractFeatures(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  matchFeaturesAtScale(currentFeatures, frame, scale) {
    const matches = [];
    const matchedRefPoints = new Set();

    for (const cf of currentFeatures) {
      let bestMatch = { distance: Infinity, feature: null };
      let secondBest = { distance: Infinity };

      for (const rf of this.referenceFeatures) {
        if (matchedRefPoints.has(rf)) continue;
        
        const distance = this.computeDistance(cf.descriptor, rf.descriptor);
        if (distance < bestMatch.distance) {
          secondBest = { distance: bestMatch.distance };
          bestMatch = { distance, feature: rf };
        } else if (distance < secondBest.distance) {
          secondBest = { distance };
        }
      }

      if (bestMatch.distance < this.matchThreshold * secondBest.distance) {
        matches.push({
          current: cf,
          reference: bestMatch.feature,
          distance: bestMatch.distance
        });
        matchedRefPoints.add(bestMatch.feature);
      }
    }

    if (matches.length >= this.minMatches) {
      const position = this.computeMarkerPosition(matches, frame, scale);
      return {
        matched: true,
        position,
        scale,
        confidence: matches.length / this.maxFeatures
      };
    }

    return { matched: false };
  }

  computeMarkerPosition(matches, frame, scale) {
    let sumX = 0, sumY = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    matches.forEach(match => {
      sumX += match.current.x;
      sumY += match.current.y;
      
      minX = Math.min(minX, match.current.x);
      maxX = Math.max(maxX, match.current.x);
      minY = Math.min(minY, match.current.y);
      maxY = Math.max(maxY, match.current.y);
    });

    const centerX = (sumX / matches.length) / scale;
    const centerY = (sumY / matches.length) / scale;
    
    return {
      x: (centerX / frame.width) * 100,
      y: (centerY / frame.height) * 100,
      width: ((maxX - minX) / scale) / frame.width * 100,
      height: ((maxY - minY) / scale) / frame.height * 100
    };
  }

  computeDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
      const diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
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
  const [isMarkerDetected, setIsMarkerDetected] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Loading content...');
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
          setDebugInfo('Failed to initialize matcher');
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
      setDebugInfo('Video playing');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Tap screen for sound');
      
      const playOnTap = async () => {
        try {
          await overlayVideoRef.current?.play();
          setIsVideoPlaying(true);
          setDebugInfo('Video playing');
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
      setIsMarkerDetected(true);
      setMatchConfidence(result.confidence);
      setCanvasPosition(result.position);
      setCanvasSize({
        width: Math.max(20, Math.min(60, result.position.width)),
        height: Math.max(20, Math.min(60, result.position.height))
      });

      if (!isVideoPlaying) {
        startVideo();
      }
    } else {
      setIsMarkerDetected(false);
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
          setDebugInfo('Camera ready - Show marker');
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
      zIndex: 30,
      fontSize: '14px'
    },
    markerIndicator: {
      position: 'absolute',
      top: 20,
      right: 20,
      padding: '8px 12px',
      borderRadius: '5px',
      zIndex: 30,
      fontSize: '14px',
      backgroundColor: isMarkerDetected ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)',
      color: 'white',
      transition: 'background-color 0.3s ease'
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
        <div>Match Confidence: {(matchConfidence * 100).toFixed(1)}%</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>

      <div style={styles.markerIndicator}>
        {isMarkerDetected ? 'Marker Detected' : 'Scanning...'}
      </div>
    </div>
  );
};

export default App;