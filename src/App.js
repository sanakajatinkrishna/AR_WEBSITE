import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const referenceImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [matchFound, setMatchFound] = useState(false);
  const [videoPosition, setVideoPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const matchImages = useCallback((capturedImageData, referenceImageData) => {
    try {
      const referencePixels = referenceImageData.data;
      const capturedPixels = capturedImageData.data;
      let matchingPixels = 0;
      let totalPixels = 0;

      // Compare pixels with a stride of 10 for performance
      for (let i = 0; i < referencePixels.length; i += 40) {
        // Calculate color differences
        const rDiff = Math.abs(referencePixels[i] - capturedPixels[i]);
        const gDiff = Math.abs(referencePixels[i + 1] - capturedPixels[i + 1]);
        const bDiff = Math.abs(referencePixels[i + 2] - capturedPixels[i + 2]);

        // Consider it a match if the difference is small enough
        if (rDiff < 50 && gDiff < 50 && bDiff < 50) {
          matchingPixels++;
        }
        totalPixels++;
      }

      return (matchingPixels / totalPixels) * 100;
    } catch (error) {
      console.error('Match calculation error:', error);
      return 0;
    }
  }, []);

  const startVideoPlayback = useCallback(() => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    overlayVideoRef.current.src = videoUrl;
    overlayVideoRef.current.muted = false;

    const playVideo = async () => {
      try {
        await overlayVideoRef.current.play();
        setIsVideoPlaying(true);
        setDebugInfo('Video playing');
      } catch (error) {
        console.error('Video autoplay failed:', error);
        setDebugInfo('Tap to play video');
        
        const handleClick = () => {
          overlayVideoRef.current?.play()
            .then(() => {
              setIsVideoPlaying(true);
              setDebugInfo('Video playing');
              document.removeEventListener('click', handleClick);
            })
            .catch(console.error);
        };
        
        document.addEventListener('click', handleClick);
      }
    };

    playVideo();
  }, [videoUrl, isVideoPlaying]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const referenceImage = referenceImageRef.current;

    if (!video || !canvas || !referenceImage) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });

    // Update canvas size if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw current frame
    context.drawImage(video, 0, 0);

    // Get frame data
    const capturedData = context.getImageData(0, 0, canvas.width, canvas.height);
    const refContext = referenceImage.getContext('2d');
    const referenceData = refContext.getImageData(0, 0, referenceImage.width, referenceImage.height);

    // Check for match
    const matchPercentage = matchImages(capturedData, referenceData);
    
    if (matchPercentage > 40) {
      if (!matchFound) {
        setMatchFound(true);
        setVideoPosition({
          x: canvas.width / 4,
          y: canvas.height / 4,
          width: canvas.width / 2,
          height: canvas.height / 2
        });

        if (!isVideoPlaying) {
          startVideoPlayback();
        }
      }
    } else {
      setMatchFound(false);
    }

    setDebugInfo(`Match: ${matchPercentage.toFixed(1)}%`);
    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [matchImages, matchFound, isVideoPlaying, startVideoPlayback]);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
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
        const data = doc.data();

        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);

        // Load reference image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          referenceImageRef.current = canvas;
          setDebugInfo('Ready to scan');
        };
        img.src = data.imageUrl;

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (!isComponentMounted) return;

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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
      isComponentMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
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
      top: `${videoPosition.y}px`,
      left: `${videoPosition.x}px`,
      width: `${videoPosition.width}px`,
      height: `${videoPosition.height}px`,
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
    },
    referenceImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '150px',
      height: '150px',
      objectFit: 'contain',
      borderRadius: '5px',
      opacity: 0.7,
      zIndex: 30,
      backgroundColor: 'rgba(0,0,0,0.3)'
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

      {matchFound && videoUrl && (
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
        {debugInfo}
      </div>

      {imageUrl && (
        <img 
          src={imageUrl}
          alt="AR marker to scan"
          style={styles.referenceImage}
        />
      )}
    </div>
  );
};

export default App;