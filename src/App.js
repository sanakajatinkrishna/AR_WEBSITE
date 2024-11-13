import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  increment 
} from 'firebase/firestore';
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
    this.matchThreshold = 0.6;
    this.lastMatchTime = 0;
    this.processEveryNthPixel = 1;
    this.featurePoints = [];
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

          const aspectRatio = width / height;
          if (width > height) {
            width = maxSize;
            height = maxSize / aspectRatio;
          } else {
            height = maxSize;
            width = maxSize * aspectRatio;
          }

          this.targetCanvas.width = width;
          this.targetCanvas.height = height;
          this.targetCtx.drawImage(img, 0, 0, width, height);
          
          const imageData = this.targetCtx.getImageData(0, 0, width, height);
          this.targetImage = {
            data: imageData.data,
            width: width,
            height: height
          };
          
          this.extractFeaturePoints(imageData);
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

  extractFeaturePoints(imageData) {
    const { data, width, height } = imageData;
    this.featurePoints = [];
    
    const gridSize = 20;
    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        const gx = this.getGradientX(data, x, y, width);
        const gy = this.getGradientY(data, x, y, width, height);
        const gradient = Math.sqrt(gx * gx + gy * gy);
        
        if (gradient > 50) {
          this.featurePoints.push({
            x, y,
            color: [r, g, b],
            gradient
          });
        }
      }
    }
  }

  getGradientX(data, x, y, width) {
    const idx = (y * width + x) * 4;
    const left = x > 0 ? (y * width + (x - 1)) * 4 : idx;
    const right = x < width - 1 ? (y * width + (x + 1)) * 4 : idx;
    
    return (
      (data[right] - data[left]) +
      (data[right + 1] - data[left + 1]) +
      (data[right + 2] - data[left + 2])
    ) / 3;
  }

  getGradientY(data, x, y, width, height) {
    const idx = (y * width + x) * 4;
    const up = y > 0 ? ((y - 1) * width + x) * 4 : idx;
    const down = y < height - 1 ? ((y + 1) * width + x) * 4 : idx;
    
    return (
      (data[down] - data[up]) +
      (data[down + 1] - data[up + 1]) +
      (data[down + 2] - data[up + 2])
    ) / 3;
  }

  matchFrame(frame) {
    if (!this.targetImage || !this.featurePoints.length) {
      return { matched: false };
    }

    const now = Date.now();
    if (now - this.lastMatchTime < 100) {
      return { matched: false };
    }
    this.lastMatchTime = now;

    const { width: frameWidth, height: frameHeight, data: frameData } = frame;
    const scales = [0.5, 0.75, 1, 1.25, 1.5];
    let bestMatch = { score: 0, x: 0, y: 0, scale: 1 };

    for (const scale of scales) {
      const searchWidth = Math.floor(this.targetImage.width * scale);
      const searchHeight = Math.floor(this.targetImage.height * scale);

      if (searchWidth > frameWidth || searchHeight > frameHeight) continue;

      const stepSize = Math.max(10, Math.floor(searchWidth * 0.1));
      for (let y = 0; y <= frameHeight - searchHeight; y += stepSize) {
        for (let x = 0; x <= frameWidth - searchWidth; x += stepSize) {
          const score = this.compareRegionFeatures(frameData, frameWidth, x, y, scale);
          
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
          x: (bestMatch.x + bestMatch.width / 2) / frameWidth * 100,
          y: (bestMatch.y + bestMatch.height / 2) / frameHeight * 100
        },
        size: {
          width: (bestMatch.width / frameWidth) * 100,
          height: (bestMatch.height / frameHeight) * 100
        },
        confidence: bestMatch.score
      };
    }

    return { matched: false };
  }

  compareRegionFeatures(frameData, frameWidth, offsetX, offsetY, scale) {
    let matches = 0;
    let total = this.featurePoints.length;
    
    for (const point of this.featurePoints) {
      const scaledX = Math.floor(point.x * scale) + offsetX;
      const scaledY = Math.floor(point.y * scale) + offsetY;
      
      const idx = (scaledY * frameWidth + scaledX) * 4;
      const frameColor = [
        frameData[idx],
        frameData[idx + 1],
        frameData[idx + 2]
      ];
      
      if (this.compareColors(point.color, frameColor)) {
        matches++;
      }
    }
    
    return matches / total;
  }

  compareColors(color1, color2) {
    const threshold = 30;
    return Math.abs(color1[0] - color2[0]) < threshold &&
           Math.abs(color1[1] - color2[1]) < threshold &&
           Math.abs(color1[2] - color2[2]) < threshold;
  }
}

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const matcher = useRef(null);
  const docRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 40, height: 40 });
  const [matchConfidence, setMatchConfidence] = useState(0);
  const [isMarkerDetected, setIsMarkerDetected] = useState(false);
  const [lastViewUpdate, setLastViewUpdate] = useState(0);

  // Initialize content and matcher
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

        const doc = snapshot.docs[0];
        docRef.current = doc.ref;
        const data = doc.data();
        
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        
        matcher.current = new ImageMatcher();
        const initialized = await matcher.current.initialize(data.imageUrl);
        
        if (initialized) {
          setDebugInfo('Ready - Show marker image');
        } else {
          setDebugInfo('Failed to initialize matcher');
        }
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
    
    return () => {
      if (matcher.current) {
        matcher.current = null;
      }
    };
  }, [contentKey]);

  // Handle video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing');

      // Update view count
      if (docRef.current) {
        const now = Date.now();
        if (now - lastViewUpdate > 60000) { // Update once per minute
          try {
            await updateDoc(docRef.current, {
              views: increment(1)
            });
            setLastViewUpdate(now);
          } catch (error) {
            console.error('Error updating view count:', error);
          }
        }
      }
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
  }, [videoUrl, isVideoPlaying, lastViewUpdate]);

  // Process video frames
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

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        // Request highest quality video possible
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            // Ask for highest quality
            width: { ideal: 4096 },
            height: { ideal: 2160 },
            frameRate: { ideal: 60 },
            // Request best quality
            advanced: [
              {
                // Prioritize resolution and focus
                autoFocus: 'continuous',
                focusMode: 'continuous',
                exposureMode: 'continuous',
                whiteBalanceMode: 'continuous'
              }
            ]
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Set video element to maintain quality
          videoRef.current.setAttribute('playsinline', true);
          await videoRef.current.play();
          setDebugInfo('Camera ready - Show marker');
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
      } catch (error) {
        console.error('Camera error:', error);
        // If high quality fails, try fallback options
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
            }
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', true);
            await videoRef.current.play();
            setDebugInfo('Camera ready (fallback mode)');
            animationFrameRef.current = requestAnimationFrame(processFrame);
          }
        } catch (fallbackError) {
          console.error('Fallback camera error:', fallbackError);
          setDebugInfo('Camera error - Please allow camera access');
        }
      }
    };

    if (videoUrl && imageUrl) {
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
  }, [processFrame, videoUrl, imageUrl]);


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
      objectFit: 'cover',
            imageRendering: 'high-quality',
      willChange: 'transform'

    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.5
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
      transition: 'all 0.1s ease-out',
      display: isMarkerDetected ? 'block' : 'none'
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
      fontSize: '14px',
      fontFamily: 'monospace'
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
      transition: 'background-color 0.3s ease',
       imageRendering: 'high-quality',
      willChange: 'transform'
    },
    targetImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '100px',
      height: 'auto',
      zIndex: 30,
      border: '2px solid white',
      borderRadius: '5px',
      opacity: 0.8
    },
    performanceStats: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30,
      fontSize: '12px',
      fontFamily: 'monospace'
    }
  };

  return (
    <div style={styles.container}>
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />
      
      {/* Processing Canvas */}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

      {/* AR Video Overlay */}
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

      {/* Target Image Preview */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Target marker"
          style={styles.targetImage}
        />
      )}

      {/* Debug Information */}
      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Confidence: {(matchConfidence * 100).toFixed(1)}%</div>
        <div>Position: {Math.round(canvasPosition.x)}%, {Math.round(canvasPosition.y)}%</div>
        <div>Size: {Math.round(canvasSize.width)}%, {Math.round(canvasSize.height)}%</div>
      </div>

      {/* Marker Detection Indicator */}
      <div style={styles.markerIndicator}>
        {isMarkerDetected ? 'Marker Detected' : 'Scanning...'}
      </div>

      {/* Performance Stats */}
      <div style={styles.performanceStats}>
        <div>FPS: {Math.round(1000 / (Date.now() - lastViewUpdate))}</div>
        <div>Resolution: {videoRef.current?.videoWidth || 0}x{videoRef.current?.videoHeight || 0}</div>
      </div>
    </div>
  );
};

export default App;