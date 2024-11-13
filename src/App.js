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
    this.targetImage = null;
    this.targetCanvas = document.createElement('canvas');
    this.targetCtx = this.targetCanvas.getContext('2d', { willReadFrequently: true });
    this.searchCanvas = document.createElement('canvas');
    this.searchCtx = this.searchCanvas.getContext('2d', { willReadFrequently: true });
    this.matchThreshold = 0.35;
  }

  async initialize(imageUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve, reject) => {
        img.onload = () => {
          // Resize image to a manageable size
          const maxSize = 200;
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
          this.targetImage = this.targetCtx.getImageData(0, 0, width, height);
          console.log('Target image initialized:', width, 'x', height);
          resolve(true);
        };

        img.onerror = () => {
          console.error('Failed to load target image');
          reject(new Error('Image load failed'));
        };

        img.src = imageUrl;
      });
    } catch (error) {
      console.error('Target image initialization failed:', error);
      throw error;
    }
  }

  matchFrame(frame) {
    if (!this.targetImage) return { matched: false };

    const scales = [0.5, 0.75, 1, 1.25, 1.5];
    let bestMatch = { score: 0, x: 0, y: 0, scale: 1 };

    for (const scale of scales) {
      const searchWidth = Math.floor(this.targetImage.width * scale);
      const searchHeight = Math.floor(this.targetImage.height * scale);

      if (searchWidth > frame.width || searchHeight > frame.height) continue;

      // Prepare search canvas
      this.searchCanvas.width = frame.width;
      this.searchCanvas.height = frame.height;
      this.searchCtx.putImageData(frame, 0, 0);

      const stepSize = Math.max(10, Math.floor(searchWidth * 0.1)); // 10% of width, minimum 10px

      for (let y = 0; y <= frame.height - searchHeight; y += stepSize) {
        for (let x = 0; x <= frame.width - searchWidth; x += stepSize) {
          const score = this.compareRegions(x, y, searchWidth, searchHeight);
          
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

  compareRegions(x, y, width, height) {
    // Create temporary canvas for comparison
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCanvas.width = this.targetImage.width;
    tempCanvas.height = this.targetImage.height;

    // Extract and scale region
    tempCtx.drawImage(
      this.searchCanvas,
      x, y, width, height,
      0, 0, this.targetImage.width, this.targetImage.height
    );

    const regionData = tempCtx.getImageData(0, 0, this.targetImage.width, this.targetImage.height);
    return this.calculateSimilarity(this.targetImage, regionData);
  }

  calculateSimilarity(img1, img2) {
    const data1 = img1.data;
    const data2 = img2.data;
    let matchCount = 0;
    let totalPixels = 0;

    // Compare every 4th pixel (RGBA values)
    for (let i = 0; i < data1.length; i += 16) {
      const r1 = data1[i];
      const g1 = data1[i + 1];
      const b1 = data1[i + 2];
      
      const r2 = data2[i];
      const g2 = data2[i + 1];
      const b2 = data2[i + 2];

      // Calculate color difference
      const colorDiff = Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
      );

      if (colorDiff < 100) { // Threshold for color similarity
        matchCount++;
      }
      totalPixels++;
    }

    return matchCount / totalPixels;
  }
}

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const matcher = useRef(null);

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
        console.log('Content loaded:', data);
        setVideoUrl(data.videoUrl);
        
        matcher.current = new ImageMatcher();
        const initialized = await matcher.current.initialize(data.imageUrl);
        
        if (initialized) {
          setDebugInfo('Ready - Show marker image');
        } else {
          setDebugInfo('Failed to initialize matcher');
        }
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo('Error loading content');
      }
    };

    loadContent();
    
    return () => {
      if (matcher.current) {
        // Cleanup
        matcher.current = null;
      }
    };
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
      setDebugInfo('Tap to play video');
      
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

    if (!video || !canvas || !matcher.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

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
            height: { ideal: 720 }
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
        setDebugInfo('Camera error - Please allow camera access');
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
        <div>Match Confidence: {(matchConfidence * 100).toFixed(1)}%</div>
        <div>Marker Detected: {isMarkerDetected ? 'Yes' : 'No'}</div>
      </div>

      <div style={styles.markerIndicator}>
        {isMarkerDetected ? 'Marker Detected' : 'Scanning...'}
      </div>
    </div>
  );
};

export default App;