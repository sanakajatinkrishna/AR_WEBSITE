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
    this.matchThreshold = 0.75; // Increased threshold for more lenient matching
    this.minMatches = 5; // Reduced minimum matches required
    this.lastMatchPosition = null;
    this.smoothingFactor = 0.6;
    this.scales = [0.5, 0.75, 1.0, 1.25, 1.5];
    this.gridSize = 8; // Reduced grid size for more features
    this.maxFeatures = 300; // Increased max features
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
      
      // Debug log of feature distribution
      this.logFeatureDistribution(this.referenceFeatures, img.width, img.height);
      return true;
    } catch (error) {
      console.error('Reference image initialization failed:', error);
      return false;
    }
  }

  logFeatureDistribution(features, width, height) {
    console.log('Feature distribution analysis:');
    const gridCells = 4;
    const cellWidth = width / gridCells;
    const cellHeight = height / gridCells;
    const distribution = Array(gridCells * gridCells).fill(0);

    features.forEach(feature => {
      const gridX = Math.floor(feature.x / cellWidth);
      const gridY = Math.floor(feature.y / cellHeight);
      const idx = gridY * gridCells + gridX;
      if (idx >= 0 && idx < distribution.length) {
        distribution[idx]++;
      }
    });

    console.log('Distribution matrix:', distribution);
  }

  extractFeatures(imageData) {
    const features = [];
    const { width, height, data } = imageData;
    const stepSize = Math.max(4, Math.floor(this.gridSize / 2)); // Smaller step size

    for (let y = this.gridSize; y < height - this.gridSize; y += stepSize) {
      for (let x = this.gridSize; x < width - this.gridSize; x += stepSize) {
        const descriptor = this.computeDescriptor(data, width, x, y);
        if (descriptor) {
          const strength = this.computeFeatureStrength(data, width, x, y);
          if (strength > 1000) { // Only keep strong features
            features.push({ x, y, descriptor, strength });
          }
        }
      }
    }

    features.sort((a, b) => b.strength - a.strength);
    return features.slice(0, this.maxFeatures);
  }

  computeDescriptor(data, width, centerX, centerY) {
    const descriptor = new Float32Array(64); // Reduced descriptor size
    let idx = 0;
    let hasSignificantGradient = false;
    const cellSize = 4; // Smaller cell size for more detail

    for (let dy = -this.gridSize; dy <= this.gridSize; dy += cellSize) {
      for (let dx = -this.gridSize; dx <= this.gridSize; dx += cellSize) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        const gradX = this.getGradientX(data, width, x, y);
        const gradY = this.getGradientY(data, width, x, y);
        
        const magnitude = Math.sqrt(gradX * gradX + gradY * gradY);
        const orientation = Math.atan2(gradY, gradX);

        descriptor[idx++] = magnitude;
        descriptor[idx++] = orientation;

        if (magnitude > 20) { // Reduced threshold for significant gradients
          hasSignificantGradient = true;
        }
      }
    }

    return hasSignificantGradient ? this.normalizeDescriptor(descriptor) : null;
  }

  normalizeDescriptor(descriptor) {
    const norm = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < descriptor.length; i++) {
        descriptor[i] /= norm;
      }
    }
    return descriptor;
  }

  getGradientX(data, width, x, y) {
    const idx = (y * width + x) * 4;
    const left = data[idx - 4] || data[idx];
    const right = data[idx + 4] || data[idx];
    return right - left;
  }

  getGradientY(data, width, x, y) {
    const idx = (y * width + x) * 4;
    const up = data[idx - width * 4] || data[idx];
    const down = data[idx + width * 4] || data[idx];
    return down - up;
  }

  matchFrame(currentFrame) {
    if (!this.referenceFeatures || !currentFrame) {
      return { matched: false };
    }

    let bestMatch = { matched: false, confidence: 0 };
    const startTime = performance.now();

    // Process the frame at different scales
    for (const scale of this.scales) {
      const scaledFeatures = this.extractScaledFeatures(currentFrame, scale);
      const matchResult = this.matchFeaturesAtScale(scaledFeatures, currentFrame, scale);
      
      if (matchResult.matched && matchResult.confidence > bestMatch.confidence) {
        bestMatch = matchResult;
      }
    }

    console.log(`Frame processing time: ${performance.now() - startTime}ms`);

    if (bestMatch.matched) {
      if (this.lastMatchPosition) {
        bestMatch.position = {
          x: this.lastMatchPosition.x * this.smoothingFactor + 
             bestMatch.position.x * (1 - this.smoothingFactor),
          y: this.lastMatchPosition.y * this.smoothingFactor + 
             bestMatch.position.y * (1 - this.smoothingFactor)
        };
      }
      this.lastMatchPosition = bestMatch.position;
    } else {
      this.lastMatchPosition = null;
    }

    return bestMatch;
  }

  matchFeaturesAtScale(currentFeatures, frame, scale) {
    const matches = [];
    const matchedRefPoints = new Set();
    let totalDistance = 0;

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

      // More lenient matching criteria
      if (bestMatch.distance < this.matchThreshold * secondBest.distance) {
        matches.push({
          current: cf,
          reference: bestMatch.feature,
          distance: bestMatch.distance
        });
        matchedRefPoints.add(bestMatch.feature);
        totalDistance += bestMatch.distance;
      }
    }

    if (matches.length >= this.minMatches) {
      const averageDistance = totalDistance / matches.length;
      const confidence = 1 - (averageDistance / this.matchThreshold);
      const position = this.computeMarkerPosition(matches, frame, scale);
      
      console.log(`Matches found: ${matches.length}, Confidence: ${confidence}`);
      
      return {
        matched: true,
        position,
        scale,
        confidence: Math.max(0.1, Math.min(1.0, confidence))
      };
    }

    return { matched: false };
  }

  computeMarkerPosition(matches, frame, scale) {
    // Remove outliers using statistical analysis
    const positions = matches.map(m => ({
      x: m.current.x / scale,
      y: m.current.y / scale
    }));

    const { filteredPositions, medianX, medianY } = this.removeOutliers(positions);

    // Compute bounding box of inlier matches
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    filteredPositions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });

    return {
      x: (medianX / frame.width) * 100,
      y: (medianY / frame.height) * 100,
      width: ((maxX - minX) / frame.width) * 100,
      height: ((maxY - minY) / frame.height) * 100
    };
  }

  removeOutliers(positions) {
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);

    const medianX = this.median(xs);
    const medianY = this.median(ys);
    const madX = this.mad(xs);
    const madY = this.mad(ys);

    const threshold = 2.5; // Adjust this value to control outlier detection
    const filteredPositions = positions.filter(pos => {
      const deviationX = Math.abs(pos.x - medianX) / madX;
      const deviationY = Math.abs(pos.y - medianY) / madY;
      return deviationX < threshold && deviationY < threshold;
    });

    return { filteredPositions, medianX, medianY };
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  mad(values) {
    const med = this.median(values);
    const deviations = values.map(v => Math.abs(v - med));
    return this.median(deviations);
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