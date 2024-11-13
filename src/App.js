import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const referenceImageRef = useRef(null);
  const animationFrameRef = useRef(null);
  const matchPositionRef = useRef({ x: 50, y: 50, scale: 1 });
  
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState(null);
  const [matchPosition, setMatchPosition] = useState({ x: 50, y: 50, scale: 1 });
  const [isMatched, setIsMatched] = useState(false);

  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing');
    } catch (error) {
      console.log('Video playback error - Click to play');
      
      const playOnClick = async () => {
        try {
          if (overlayVideoRef.current) {
            await overlayVideoRef.current.play();
            setIsVideoPlaying(true);
            setDebugInfo('Video playing');
            document.removeEventListener('click', playOnClick);
          }
        } catch (err) {
          setDebugInfo('Video playback failed');
        }
      };
      
      document.addEventListener('click', playOnClick);
      setDebugInfo('Click to play video');
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
      if (diff < 150) {
        matchScore++;
      }
    }
    
    const matchPercentage = (matchScore / (totalPixels / 4)) * 100;
    
    if (matchPercentage > 50) {
      const x = (width / 2 / width) * 100;
      const y = (height / 2 / height) * 100;
      
      return {
        matched: true,
        position: { x, y },
        matchPercentage
      };
    }
    
    return { matched: false };
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !referenceImageRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    context.drawImage(video, 0, 0);
    
    const processWidth = canvas.width * 0.8;
    const processHeight = canvas.height * 0.8;
    const x = (canvas.width - processWidth) / 2;
    const y = (canvas.height - processHeight) / 2;
    
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

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [matchImages, isMatched, startVideo]);

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
          setDebugInfo('Content not found');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Handle video URL
        if (data.videoUrl.startsWith('videos/')) {
          const videoRef = ref(storage, data.videoUrl);
          const videoDownloadUrl = await getDownloadURL(videoRef);
          setVideoUrl(videoDownloadUrl);
        } else {
          setVideoUrl(data.videoUrl);
        }

        // Handle image URL
        let finalImageUrl;
        if (data.imageUrl.startsWith('images/')) {
          const imageRef = ref(storage, data.imageUrl);
          finalImageUrl = await getDownloadURL(imageRef);
        } else {
          finalImageUrl = data.imageUrl;
        }

        setReferenceImageUrl(finalImageUrl);
        setDebugInfo('Loading reference image...');

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          referenceImageRef.current = img;
          setDebugInfo('Ready - Show image to camera');
        };
        img.onerror = () => {
          setDebugInfo('Failed to load reference image');
        };
        img.src = finalImageUrl;

      } catch (error) {
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  useEffect(() => {
    if (!referenceImageUrl) return;

    let cleanup = { stop: () => {} };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }

        cleanup.stop = () => {
          stream.getTracks().forEach(track => track.stop());
        };
      } catch (error) {
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    startCamera();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cleanup.stop();
    };
  }, [processFrame, referenceImageUrl]);

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
        <div>Match Found: {isMatched ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};

export default App;