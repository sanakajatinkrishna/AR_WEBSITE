import React, { useRef, useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

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

const App = () => {
  // Get content key directly from URL
  const contentKey = new URLSearchParams(window.location.search).get('key');

  const videoRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [targetImageFeatures, setTargetImageFeatures] = useState(null);

  // Memoize extractImageFeatures function
  const extractImageFeatures = useCallback(async (imgElement) => {
    if (!modelRef.current) return null;
    
    const tfImg = tf.browser.fromPixels(imgElement);
    const features = await modelRef.current.infer(tfImg, true);
    const featureArray = await features.data();
    tfImg.dispose();
    features.dispose();
    return featureArray;
  }, []);

  // Memoize calculateSimilarity function
  const calculateSimilarity = useCallback((features1, features2) => {
    if (!features1 || !features2) return 0;
    
    const dotProduct = features1.reduce((sum, val, i) => sum + val * features2[i], 0);
    const magnitude1 = Math.sqrt(features1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(features2.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (magnitude1 * magnitude2);
  }, []);

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

  // Memoize processTargetImage function
  const processTargetImage = useCallback(async (imageUrl) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      const features = await extractImageFeatures(img);
      setTargetImageFeatures(features);
      setDebugInfo('Target image processed');
    } catch (error) {
      console.error('Target image processing error:', error);
      setDebugInfo(`Target image error: ${error.message}`);
    }
  }, [extractImageFeatures]);

  // Memoize processCameraFrame function
  const processCameraFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !targetImageFeatures || !modelRef.current) return;

    const context = canvasRef.current.getContext('2d');
    context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    const features = await extractImageFeatures(canvasRef.current);
    const similarity = calculateSimilarity(features, targetImageFeatures);
    
    const SIMILARITY_THRESHOLD = 0.85;
    const matched = similarity > SIMILARITY_THRESHOLD;
    
    if (matched && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (!matched && isMatched) {
      setIsMatched(false);
    }

    setDebugInfo(`Similarity: ${(similarity * 100).toFixed(1)}%`);
  }, [targetImageFeatures, extractImageFeatures, calculateSimilarity, isMatched, startVideo]);

  // Initialize TensorFlow model
  useEffect(() => {
    const loadModel = async () => {
      try {
        setDebugInfo('Loading ML model...');
        await tf.ready();
        modelRef.current = await mobilenet.load();
        setDebugInfo('ML model loaded');
      } catch (error) {
        console.error('Model loading error:', error);
        setDebugInfo(`Model error: ${error.message}`);
      }
    };

    loadModel();
  }, []);

  // Load content from Firebase
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        console.log('Loading content for key:', contentKey);
        setDebugInfo('Verifying content...');

        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          console.log('No content found');
          setDebugInfo('Invalid or inactive content');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        console.log('Content found:', data);

        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        await processTargetImage(data.imageUrl);
        setDebugInfo('Content loaded');

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey, processTargetImage]);

  // Camera setup with frame processing
  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;
    let frameProcessingInterval = null;

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
          console.log('Camera started');
          setDebugInfo('Camera ready');
          
          // Start frame processing
          frameProcessingInterval = setInterval(processCameraFrame, 500);
        }
      } catch (error) {
        console.error('Camera error:', error);
        if (isComponentMounted) {
          setDebugInfo(`Camera error: ${error.message}`);
        }
      }
    };

    if (videoUrl) {
      console.log('Starting camera');
      startCamera();
    }

    return () => {
      isComponentMounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      if (frameProcessingInterval) {
        clearInterval(frameProcessingInterval);
      }
    };
  }, [videoUrl, processCameraFrame]);

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
    overlayVideo: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40vw',
      height: '40vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: isMatched ? 1 : 0,
      transition: 'opacity 0.3s ease'
    },
    canvas: {
      display: 'none'  // Hidden canvas for processing
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
    imagePreview: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    },
    previewImage: {
      width: '150px',
      height: '150px',
      objectFit: 'cover',
      borderRadius: '5px'
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
        width={1280}
        height={720}
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
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img src={imageUrl} alt="Target" style={styles.previewImage} />
        </div>
      )}
    </div>
  );
};

export default App;