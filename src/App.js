import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc } from 'firebase/firestore';

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

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const trackedPositionRef = useRef({ x: 50, y: 50 });

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isCanvasDetected, setIsCanvasDetected] = useState(false);

  // Detect canvas in the frame
  const detectCanvas = useCallback((imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    
    let totalR = 0, totalG = 0, totalB = 0;
    let samples = 0;

    // Sample pixels for average color
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        totalR += imageData.data[i];
        totalG += imageData.data[i + 1];
        totalB += imageData.data[i + 2];
        samples++;
      }
    }

    const avgR = totalR / samples;
    const avgG = totalG / samples;
    const avgB = totalB / samples;

    // Check if significant content is present
    const hasContent = (avgR > 30 || avgG > 30 || avgB > 30) && 
                      (avgR < 240 || avgG < 240 || avgB < 240);

    if (hasContent) {
      // Find content boundaries
      let left = width, right = 0, top = height, bottom = 0;

      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];

          if (Math.abs(r - avgR) > 20 || Math.abs(g - avgG) > 20 || Math.abs(b - avgB) > 20) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }

      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const objWidth = right - left;
      const objHeight = bottom - top;

      // Convert to percentages
      const posX = (centerX / width) * 100;
      const posY = (centerY / height) * 100;

      // Apply smoothing
      trackedPositionRef.current.x = trackedPositionRef.current.x * 0.8 + posX * 0.2;
      trackedPositionRef.current.y = trackedPositionRef.current.y * 0.8 + posY * 0.2;

      return {
        position: { x: trackedPositionRef.current.x, y: trackedPositionRef.current.y },
        size: { width: objWidth, height: objHeight },
        detected: true
      };
    }

    return { detected: false };
  }, []);

  // Handle video playback
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
      setDebugInfo('Click anywhere to play video with sound');
      
      const playOnClick = () => {
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play()
            .then(() => {
              setIsVideoPlaying(true);
              setDebugInfo('Video playing with sound');
              document.removeEventListener('click', playOnClick);
            })
            .catch(console.error);
        }
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Process frames
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false 
    });

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    context.drawImage(video, 0, 0);
    
    // Get center region
    const centerWidth = canvas.width * 0.5;
    const centerHeight = canvas.height * 0.5;
    const x = (canvas.width - centerWidth) / 2;
    const y = (canvas.height - centerHeight) / 2;
    
    const imageData = context.getImageData(x, y, centerWidth, centerHeight);
    const result = detectCanvas(imageData);
    
    if (result.detected) {
      setCanvasPosition(result.position);
      setCanvasSize(result.size);
      
      if (!isCanvasDetected) {
        setIsCanvasDetected(true);
        startVideo();
      }
    } else if (isCanvasDetected) {
      setIsCanvasDetected(false);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [detectCanvas, startVideo, isCanvasDetected]);

  // Load content from URL parameter
  useEffect(() => {
    const loadContent = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const contentId = urlParams.get('id');

        if (!contentId) {
          const snapshot = await collection(db, 'arContent').limit(1).get();
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            setVideoUrl(data.videoUrl);
            setDebugInfo('Ready - Detecting canvas');
          } else {
            setDebugInfo('No content found');
          }
        } else {
          const docRef = doc(db, 'arContent', contentId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setVideoUrl(data.videoUrl);
            setDebugInfo('Ready - Detecting canvas');
          } else {
            setDebugInfo('Content not found');
          }
        }
      } catch (error) {
        console.error('Error loading content:', error);
        setDebugInfo(`Loading error: ${error.message}`);
      }
    };

    loadContent();
  }, []);

  // Initialize camera
  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (!isComponentMounted) return;

        const videoTrack = stream.getVideoTracks()[0];
        await videoTrack.applyConstraints({
          advanced: [
            { exposureMode: "continuous" },
            { focusMode: "continuous" },
            { whiteBalanceMode: "continuous" }
          ]
        }).catch(() => {});

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera ready - Show canvas');
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    startCamera();

    return () => {
      isComponentMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame]);

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
          style={{
            ...styles.overlayVideo,
            top: `${canvasPosition.y}%`,
            left: `${canvasPosition.x}%`,
            width: `${Math.min(canvasSize.width * 1.2, window.innerWidth * 0.8)}px`,
            height: `${Math.min(canvasSize.height * 1.2, window.innerHeight * 0.8)}px`,
          }}
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Canvas Detected: {isCanvasDetected ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};

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
    display: 'none'
  },
  overlayVideo: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
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
  }
};

export default ARViewer;