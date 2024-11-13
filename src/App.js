import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const referenceImageRef = useRef(null);
  const animationFrameRef = useRef(null);
  const matchPositionRef = useRef({ x: 50, y: 50, scale: 1 });
  
  // State
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState(null);
  const [matchPosition, setMatchPosition] = useState({ x: 50, y: 50, scale: 1 });
  const [isMatched, setIsMatched] = useState(false);
  const [loadingError, setLoadingError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Click to play video');
      
      const playOnClick = async () => {
        try {
          if (overlayVideoRef.current) {
            await overlayVideoRef.current.play();
            setIsVideoPlaying(true);
            setDebugInfo('Video playing');
            document.removeEventListener('click', playOnClick);
          }
        } catch (clickError) {
          console.error('Click-to-play error:', clickError);
          setDebugInfo('Video playback failed');
        }
      };
      
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl]);

  const matchImages = useCallback((currentImageData, width, height) => {
    if (!referenceImageRef.current) return null;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = width;
    tempCanvas.height = height;
    
    tempCtx.drawImage(referenceImageRef.current, 0, 0, width, height);
    const referenceData = tempCtx.getImageData(0, 0, width, height).data;
    
    let matchScore = 0;
    let totalPixels = currentImageData.data.length / 4;
    
    for (let i = 0; i < currentImageData.data.length; i += 16) {
      const currentR = currentImageData.data[i];
      const currentG = currentImageData.data[i + 1];
      const currentB = currentImageData.data[i + 2];
      
      const refR = referenceData[i];
      const refG = referenceData[i + 1];
      const refB = referenceData[i + 2];
      
      const diff = Math.abs(currentR - refR) + Math.abs(currentG - refG) + Math.abs(currentB - refB);
      if (diff < 150) matchScore++;
    }
    
    const matchPercentage = (matchScore / (totalPixels / 4)) * 100;
    
    if (matchPercentage > 50) {
      return {
        matched: true,
        position: { 
          x: (width / 2 / width) * 100,
          y: (height / 2 / height) * 100
        },
        matchPercentage
      };
    }
    
    return { matched: false };
  }, []);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImageRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvasRef.current.getContext('2d', { willReadFrequently: true });
    
    if (canvasRef.current.width !== videoRef.current.videoWidth || 
        canvasRef.current.height !== videoRef.current.videoHeight) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
    }
    
    context.drawImage(videoRef.current, 0, 0);
    
    const processWidth = canvasRef.current.width * 0.8;
    const processHeight = canvasRef.current.height * 0.8;
    const x = (canvasRef.current.width - processWidth) / 2;
    const y = (canvasRef.current.height - processHeight) / 2;
    
    try {
      const imageData = context.getImageData(x, y, processWidth, processHeight);
      const matchResult = matchImages(imageData, processWidth, processHeight);
      
      if (matchResult?.matched) {
        matchPositionRef.current = {
          x: matchPositionRef.current.x * 0.8 + matchResult.position.x * 0.2,
          y: matchPositionRef.current.y * 0.8 + matchResult.position.y * 0.2,
          scale: 1
        };
        
        setMatchPosition(matchPositionRef.current);
        
        if (!isMatched) {
          setIsMatched(true);
          startVideo();
          setDebugInfo(`Match found (${matchResult.matchPercentage.toFixed(1)}%)`);
        }
      } else if (isMatched) {
        setIsMatched(false);
        setDebugInfo('Show image to camera');
      }
    } catch (error) {
      console.error('Frame processing error:', error);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [matchImages, isMatched, startVideo]);

  const loadContent = useCallback(async () => {
    if (!contentKey) {
      setDebugInfo('No content key found');
      setLoadingError('Invalid or missing content key');
      return;
    }

    try {
      setDebugInfo('Loading content...');
      console.log('Loading content for key:', contentKey);

      const arContentRef = collection(db, 'arContent');
      const q = query(arContentRef, where('contentKey', '==', contentKey), where('isActive', '==', true));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error('Content not found or inactive');
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      
      if (!data.fileName?.image || !data.fileName?.video) {
        throw new Error('Invalid content data structure');
      }

      // Load video URL
      const videoRef = ref(storage, data.fileName.video);
      const videoDownloadUrl = await getDownloadURL(videoRef);
      setVideoUrl(videoDownloadUrl);
      
      // Load image URL
      const imageRef = ref(storage, data.fileName.image);
      const imageDownloadUrl = await getDownloadURL(imageRef);
      
      // Create and load the image
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          referenceImageRef.current = img;
          setReferenceImageUrl(imageDownloadUrl);
          setDebugInfo('Content loaded - Initializing camera...');
          resolve();
        };
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        img.src = imageDownloadUrl;
      });

      // Update view count
      try {
        await doc.ref.update({ views: (data.views || 0) + 1 });
      } catch (error) {
        console.error('Failed to update view count:', error);
      }

    } catch (error) {
      console.error('Content loading error:', error);
      setDebugInfo(`Error: ${error.message}`);
      setLoadingError(error.message);
    }
  }, [contentKey]);

  const initializeCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
        setDebugInfo('Camera ready - Show image to camera');
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }

      return () => {
        stream.getTracks().forEach(track => track.stop());
      };
    } catch (error) {
      console.error('Camera error:', error);
      setDebugInfo(`Camera error: ${error.message}`);
      setLoadingError(`Camera access failed: ${error.message}`);
      return () => {};
    }
  }, [processFrame]);

  // Load content
  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Initialize camera after content is loaded
  useEffect(() => {
    if (!referenceImageUrl) return;

    let cleanup = { stop: () => {} };

    const setupCamera = async () => {
      cleanup.stop = await initializeCamera();
    };

    setupCamera();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cleanup.stop();
    };
  }, [referenceImageUrl, initializeCamera]);

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
      top: `${matchPosition.y}%`,
      left: `${matchPosition.x}%`,
      transform: `translate(-50%, -50%) scale(${matchPosition.scale})`,
      width: '40vw',
      height: '40vh',
      objectFit: 'contain',
      opacity: isMatched ? 1 : 0,
      transition: 'opacity 0.3s ease-out',
      zIndex: 20
    },
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '14px',
      lineHeight: '1.5',
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
        <div>Content Key: {contentKey || 'Not found'}</div>
        <div>Reference Image: {referenceImageUrl ? 'Loaded' : 'Not loaded'}</div>
        <div>Camera: {isCameraReady ? 'Ready' : 'Not ready'}</div>
        <div>Match Found: {isMatched ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        {loadingError && <div style={{color: '#ff6b6b'}}>Error: {loadingError}</div>}
      </div>
    </div>
  );
};

export default App;