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
    this.templateImageData = null;
    this.templateWidth = 0;
    this.templateHeight = 0;
  }

  async initialize(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const img = await createImageBitmap(blob);
      
      // Create a canvas to process the template image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      this.templateImageData = ctx.getImageData(0, 0, img.width, img.height);
      this.templateWidth = img.width;
      this.templateHeight = img.height;
      
      console.log('Template initialized:', img.width, 'x', img.height);
      return true;
    } catch (error) {
      console.error('Template initialization failed:', error);
      return false;
    }
  }

  findMatches(frameImageData) {
    const { width: frameWidth, height: frameHeight } = frameImageData;
    const stepSize = 16; // Scan step size
    const scales = [0.5, 0.75, 1, 1.25, 1.5];
    let bestMatch = { score: 0, x: 0, y: 0, scale: 1 };

    for (const scale of scales) {
      const searchWidth = Math.floor(this.templateWidth * scale);
      const searchHeight = Math.floor(this.templateHeight * scale);

      // Skip if scaled template is larger than frame
      if (searchWidth > frameWidth || searchHeight > frameHeight) continue;

      for (let y = 0; y < frameHeight - searchHeight; y += stepSize) {
        for (let x = 0; x < frameWidth - searchWidth; x += stepSize) {
          const score = this.compareRegion(frameImageData, x, y, searchWidth, searchHeight);
          
          if (score > bestMatch.score) {
            bestMatch = { score, x, y, scale, width: searchWidth, height: searchHeight };
          }
        }
      }
    }

    // Return match if score is above threshold
    if (bestMatch.score > 0.5) {
      return {
        matched: true,
        position: {
          x: (bestMatch.x + bestMatch.width/2) / frameWidth * 100,
          y: (bestMatch.y + bestMatch.height/2) / frameHeight * 100
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

  compareRegion(frameImageData, startX, startY, width, height) {
    const { data: frameData } = frameImageData;
    const { data: templateData } = this.templateImageData;
    const frameWidth = frameImageData.width;
    let totalDiff = 0;
    let samples = 0;

    // Compare downsampled regions for speed
    const sampleStep = 4;
    
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const frameIdx = ((startY + y) * frameWidth + (startX + x)) * 4;
        const templateIdx = (Math.floor(y * this.templateHeight / height) * this.templateWidth + 
                           Math.floor(x * this.templateWidth / width)) * 4;

        // Compare RGB values
        const rDiff = Math.abs(frameData[frameIdx] - templateData[templateIdx]);
        const gDiff = Math.abs(frameData[frameIdx + 1] - templateData[templateIdx + 1]);
        const bDiff = Math.abs(frameData[frameIdx + 2] - templateData[templateIdx + 2]);
        
        totalDiff += (rDiff + gDiff + bDiff) / 3;
        samples++;
      }
    }

    // Convert difference to similarity score (0-1)
    return 1 - (totalDiff / (samples * 255));
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
        console.log('Content loaded:', data);
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
    
    const result = imageMatcher.current.findMatches(currentFrame);
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