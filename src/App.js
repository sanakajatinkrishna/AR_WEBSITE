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
    this.targetImage = null;
    this.targetCanvas = document.createElement('canvas');
    this.targetCtx = this.targetCanvas.getContext('2d', { willReadFrequently: true });
    this.searchCanvas = document.createElement('canvas');
    this.searchCtx = this.searchCanvas.getContext('2d', { willReadFrequently: true });
    this.matchThreshold = 0.45;
    this.lastMatchTime = 0;
    this.processEveryNthPixel = 2;
  }

  async initialize(imageUrl) {
    try {
      console.log('Initializing with image URL:', imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve, reject) => {
        img.onload = () => {
          const maxSize = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          this.targetCanvas.width = width;
          this.targetCanvas.height = height;
          this.targetCtx.drawImage(img, 0, 0, width, height);
          
          const imageData = this.targetCtx.getImageData(0, 0, width, height);
          this.targetImage = this.processImageData(imageData);
          
          console.log('Target image processed:', width, 'x', height);
          resolve(true);
        };

        img.onerror = (error) => {
          console.error('Failed to load target image:', error);
          reject(new Error('Image load failed'));
        };

        img.src = imageUrl;
      });
    } catch (error) {
      console.error('Target image initialization failed:', error);
      throw error;
    }
  }

  processImageData(imageData) {
    const { data, width, height } = imageData;
    const features = new Float32Array((width * height) / this.processEveryNthPixel);
    let featureIndex = 0;

    let totalBrightness = 0;
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      totalBrightness += brightness;
      pixelCount++;
    }

    const averageBrightness = totalBrightness / pixelCount;

    for (let i = 0; i < data.length; i += 4 * this.processEveryNthPixel) {
      const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      features[featureIndex++] = brightness - averageBrightness;
    }

    return {
      features,
      width,
      height,
      averageBrightness
    };
  }

  matchFrame(frame) {
    if (!this.targetImage || !frame) return { matched: false };

    const now = Date.now();
    if (now - this.lastMatchTime < 50) return { matched: false };
    this.lastMatchTime = now;

    // Process frame data
    const frameData = this.processImageData(frame);
    const scales = [0.7, 0.85, 1, 1.15, 1.3];
    let bestMatch = { score: 0, x: 0, y: 0, scale: 1 };

    for (const scale of scales) {
      const searchWidth = Math.floor(this.targetImage.width * scale);
      const searchHeight = Math.floor(this.targetImage.height * scale);

      if (searchWidth > frame.width || searchHeight > frame.height) continue;

      const stepSize = Math.max(20, Math.floor(searchWidth * 0.2));

      for (let y = 0; y <= frame.height - searchHeight; y += stepSize) {
        for (let x = 0; x <= frame.width - searchWidth; x += stepSize) {
          const score = this.compareRegions(frameData, x, y, searchWidth, searchHeight);
          
          if (score > bestMatch.score) {
            bestMatch = { score, x, y, width: searchWidth, height: searchHeight, scale };
          }
        }
      }
    }

    if (bestMatch.score > this.matchThreshold) {
      return {
        matched: true,
        position: {
          x: (bestMatch.x + bestMatch.width / 2) / frame.width * 100,
          y: (bestMatch.y + bestMatch.height / 2) / frame.height * 100
        },
        size: {
          width: (bestMatch.width / frame.width) * 100,
          height: (bestMatch.height / frame.height) * 100
        },
        confidence: bestMatch.score
      };
    }

    return { matched: false };
  }

  compareRegions(frameData, x, y, width, height) {
    let score = 0;
    let count = 0;

    for (let i = 0; i < this.targetImage.features.length; i++) {
      const frameIndex = (y + Math.floor(i / this.targetImage.width)) * frameData.width + 
                        (x + (i % this.targetImage.width));
      
      if (frameIndex < frameData.features.length) {
        const diff = Math.abs(this.targetImage.features[i] - frameData.features[frameIndex]);
        score += 1 / (1 + diff);
        count++;
      }
    }

    return count > 0 ? score / count : 0;
  }
}const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const matcher = useRef(null);
  const streamRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 40, height: 40 });
  const [matchConfidence, setMatchConfidence] = useState(0);
  const [isMarkerDetected, setIsMarkerDetected] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !matcher.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    context.drawImage(video, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const result = matcher.current.matchFrame(frame);
    if (result.matched) {
      setIsMarkerDetected(true);
      setMatchConfidence(result.confidence);
      setCanvasPosition(result.position);
      setCanvasSize(result.size);

      if (!isVideoPlaying && overlayVideoRef.current) {
        overlayVideoRef.current.play()
          .then(() => setIsVideoPlaying(true))
          .catch(error => console.error('Video playback error:', error));
      }
    } else {
      setIsMarkerDetected(false);
      setMatchConfidence(0);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isVideoPlaying]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (videoRef.current) {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setDebugInfo('Camera active - Show marker');
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError(error.message);
      setDebugInfo('Camera error - Please allow camera access');
    }
  }, [processFrame]);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key provided');
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
          setDebugInfo('Content not found or inactive');
          return;
        }

        const data = snapshot.docs[0].data();
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        
        matcher.current = new ImageMatcher();
        const initialized = await matcher.current.initialize(data.imageUrl);
        
        if (initialized) {
          setDebugInfo('Ready to scan - Show marker image');
          await startCamera();
        }
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [contentKey, startCamera]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black',
      overflow: 'hidden'
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
      visibility: isMarkerDetected ? 'visible' : 'hidden',
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
      color: 'white'
    },
    targetImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '100px',
      height: 'auto',
      border: '2px solid white',
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
          src={videoUrl}
          style={styles.overlayVideo}
          autoPlay
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Target marker"
          style={styles.targetImage}
        />
      )}

      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Match Confidence: {(matchConfidence * 100).toFixed(1)}%</div>
        <div>Marker Detected: {isMarkerDetected ? 'Yes' : 'No'}</div>
      </div>

      <div style={styles.markerIndicator}>
        {isMarkerDetected ? 'Marker Detected' : 'Scanning...'}
      </div>

      {cameraError && (
        <div style={styles.errorMessage}>
          Camera Error: {cameraError}
          <button 
            onClick={startCamera}
            style={{
marginTop: '10px',
              padding: '5px 10px',
              backgroundColor: 'white',
              color: 'black',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Retry Camera
          </button>
        </div>
      )}
    </div>
  );
};

export default App;