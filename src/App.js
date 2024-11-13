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
    this.matchThreshold = 0.5; // Lowered threshold for testing
    this.lastMatchTime = 0;
    this.processEveryNthPixel = 2; // Process more pixels for accuracy
  }

  async initialize(imageUrl) {
    try {
      console.log('Initializing with image URL:', imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve, reject) => {
        img.onload = () => {
          // Use original image size for better matching
          const maxSize = 400; // Increased max size
          let width = img.width;
          let height = img.height;

          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          this.targetCanvas.width = width;
          this.targetCanvas.height = height;
          this.targetCtx.drawImage(img, 0, 0, width, height);
          
          // Store the processed image data
          const imageData = this.targetCtx.getImageData(0, 0, width, height);
          this.targetImage = {
            data: imageData.data,
            width: width,
            height: height
          };
          
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

  matchFrame(frame) {
    if (!this.targetImage) {
      console.log('No target image loaded');
      return { matched: false };
    }

    // Throttle processing
    const now = Date.now();
    if (now - this.lastMatchTime < 100) { // Increased interval for better performance
      return { matched: false };
    }
    this.lastMatchTime = now;

    // Get frame dimensions
    const { width: frameWidth, height: frameHeight, data: frameData } = frame;

    // Scales to try
    const scales = [0.5, 0.75, 1, 1.25, 1.5];
    let bestMatch = { score: 0, x: 0, y: 0, scale: 1 };

    // Process frame at different scales
    for (const scale of scales) {
      const searchWidth = Math.floor(this.targetImage.width * scale);
      const searchHeight = Math.floor(this.targetImage.height * scale);

      if (searchWidth > frameWidth || searchHeight > frameHeight) continue;

      // Search with larger steps for performance
      const stepSize = Math.max(20, Math.floor(searchWidth * 0.2));

      for (let y = 0; y <= frameHeight - searchHeight; y += stepSize) {
        for (let x = 0; x <= frameWidth - searchWidth; x += stepSize) {
          // Draw the region to compare
          this.searchCtx.clearRect(0, 0, this.searchCanvas.width, this.searchCanvas.height);
          this.searchCanvas.width = searchWidth;
          this.searchCanvas.height = searchHeight;
          
          // Extract region from frame
          const frameImageData = new ImageData(
            new Uint8ClampedArray(frameData.buffer),
            frameWidth,
            frameHeight
          );
          
          this.searchCtx.putImageData(frameImageData, -x, -y);
          const regionImageData = this.searchCtx.getImageData(0, 0, searchWidth, searchHeight);
          
          // Compare the regions
          const score = this.compareRegions(regionImageData, scale);
          
          if (score > bestMatch.score) {
            bestMatch = { score, x, y, width: searchWidth, height: searchHeight, scale };
            console.log(`New best match: ${score.toFixed(2)} at (${x}, ${y}) scale ${scale}`);
          }
        }
      }
    }

    if (bestMatch.score > this.matchThreshold) {
      console.log(`Match found! Score: ${bestMatch.score.toFixed(2)}`);
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

  compareRegions(regionImageData, scale) {
    // Simple color-based comparison
    const targetData = this.targetImage.data;
    const regionData = regionImageData.data;
    let matches = 0;
    let total = 0;

    for (let i = 0; i < regionData.length; i += 4 * this.processEveryNthPixel) {
      const targetR = targetData[i];
      const targetG = targetData[i + 1];
      const targetB = targetData[i + 2];

      const regionR = regionData[i];
      const regionG = regionData[i + 1];
      const regionB = regionData[i + 2];

      // Calculate color difference
      const diff = Math.sqrt(
        Math.pow(targetR - regionR, 2) +
        Math.pow(targetG - regionG, 2) +
        Math.pow(targetB - regionB, 2)
      );

      if (diff < 50) { // More lenient color matching
        matches++;
      }
      total++;
    }

    return matches / total;
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
  const [imageUrl, setImageUrl] = useState(null);
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
        setImageUrl(data.imageUrl);
        
        matcher.current = new ImageMatcher();
        const initialized = await matcher.current.initialize(data.imageUrl);
        
        if (initialized) {
          setDebugInfo('Matcher initialized - Show marker image');
        } else {
          setDebugInfo('Failed to initialize matcher');
        }
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error loading content: ${error.message}`);
      }
    };

    loadContent();
    
    return () => {
      if (matcher.current) {
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
    
    // Ensure canvas size matches video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw the current video frame
    context.drawImage(video, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process the frame
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
      objectFit: 'cover'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.5 // Make canvas visible for debugging
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
    },
    targetImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '100px',
      height: 'auto',
      zIndex: 30,
      border: '2px solid white'
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
        {imageUrl && <div>Target Image: Loaded</div>}
        {videoUrl && <div>Video: {isVideoPlaying ? 'Playing' : 'Ready'}</div>}
      </div>

      <div style={styles.markerIndicator}>
        {isMarkerDetected ? 'Marker Detected' : 'Scanning...'}
      </div>
    </div>
  );
};

export default App;