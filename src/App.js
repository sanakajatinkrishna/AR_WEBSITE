import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase configuration
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
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  
  const [model, setModel] = useState(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [referenceImages, setReferenceImages] = useState([]);
  const [scanningStarted, setScanningStarted] = useState(false);

  // Initialize TensorFlow
  useEffect(() => {
    let isMounted = true;

    const initializeTF = async () => {
      try {
        setDebugInfo('Loading TensorFlow...');
        await tf.ready();
        await tf.setBackend('webgl');
        console.log('TensorFlow initialized');
        
        const loadedModel = await mobilenet.load();
        console.log('MobileNet model loaded');
        
        if (isMounted) {
          setModel(loadedModel);
          setDebugInfo('TensorFlow & Model Ready');
        }
      } catch (error) {
        console.error('TensorFlow initialization error:', error);
        setDebugInfo(`TensorFlow error: ${error.message}`);
      }
    };

    initializeTF();
    return () => { isMounted = false; };
  }, []);

  // Load content from Firebase
  useEffect(() => {
    let isMounted = true;

    const loadARContent = async () => {
      try {
        setDebugInfo('Loading Firebase content...');
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        console.log('Firebase docs found:', querySnapshot.size);

        const loadPromises = querySnapshot.docs.map(async (doc) => {
          const data = doc.data();
          try {
            console.log('Loading image for:', doc.id, data.imageUrl);
            const response = await fetch(data.imageUrl);
            const blob = await response.blob();
            const img = await createImageBitmap(blob);
            console.log('Image loaded successfully for:', doc.id);
            return {
              id: doc.id,
              imageUrl: data.imageUrl,
              videoUrl: data.videoUrl,
              bitmap: img
            };
          } catch (error) {
            console.error('Error loading image:', doc.id, error);
            return null;
          }
        });

        const results = await Promise.all(loadPromises);
        const validImages = results.filter(Boolean);
        
        if (isMounted) {
          console.log('Valid images loaded:', validImages.length);
          setReferenceImages(validImages);
          setDebugInfo(`Loaded ${validImages.length} reference images`);
        }
      } catch (error) {
        console.error('Firebase loading error:', error);
        setDebugInfo(`Firebase error: ${error.message}`);
      }
    };

    loadARContent();
    return () => { isMounted = false; };
  }, []);

  const startVideoStream = useCallback(async () => {
    try {
      setDebugInfo('Requesting camera access...');
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
        console.log('Camera stream started');
        setDebugInfo('Camera ready');
        return true;
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setDebugInfo(`Camera error: ${error.message}`);
    }
    return false;
  }, []);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !model || referenceImages.length === 0) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Ensure video is playing and has dimensions
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      console.log('Video not ready');
      return;
    }

    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    context.drawImage(video, 0, 0);

    try {
      // Convert frame to tensor
      const tensor = tf.browser.fromPixels(canvas);
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      const normalized = resized.toFloat().div(tf.scalar(255));
      
      // Get features
      const features = model.infer(normalized, true);

      // Check against reference images
      for (const ref of referenceImages) {
        const refTensor = tf.browser.fromPixels(ref.bitmap);
        const refResized = tf.image.resizeBilinear(refTensor, [224, 224]);
        const refNormalized = refResized.toFloat().div(tf.scalar(255));
        const refFeatures = model.infer(refNormalized, true);

        const similarity = tf.metrics.cosineProximity(features, refFeatures).dataSync()[0];
        console.log(`Similarity with ${ref.id}:`, similarity);
        setDebugInfo(`Scanning... Similarity: ${(Math.abs(similarity) * 100).toFixed(1)}%`);

        if (Math.abs(similarity) > 0.6) {
          console.log('Match found:', ref.id);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.src = ref.videoUrl;
            await overlayVideoRef.current.play();
            setIsVideoPlaying(true);
          }
        }

        // Cleanup
        refTensor.dispose();
        refResized.dispose();
        refNormalized.dispose();
        refFeatures.dispose();
      }

      // Cleanup
      tensor.dispose();
      resized.dispose();
      normalized.dispose();
      features.dispose();

    } catch (error) {
      console.error('Frame processing error:', error);
    }
  }, [model, referenceImages]);

  // Start scanning
  useEffect(() => {
    let frameId = null;
    let isActive = false;

    const scan = async () => {
      if (!isActive) return;
      
      await processFrame();
      frameId = requestAnimationFrame(scan);
    };

    const startScanning = async () => {
      if (scanningStarted || !model || referenceImages.length === 0) {
        console.log('Scanning prerequisites not met:', {
          scanningStarted,
          modelLoaded: !!model,
          imagesLoaded: referenceImages.length
        });
        return;
      }

      console.log('Starting scanner...');
      const streamStarted = await startVideoStream();
      
      if (streamStarted) {
        isActive = true;
        setScanningStarted(true);
        scan();
        console.log('Scanner started successfully');
      }
    };

    startScanning();

    return () => {
      isActive = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [model, referenceImages, processFrame, startVideoStream, scanningStarted]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, backgroundColor: 'black' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'none'
        }}
      />

      {isVideoPlaying && (
        <video
          ref={overlayVideoRef}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20vw',
            height: '50vh',
            objectFit: 'contain',
            zIndex: 20
          }}
          autoPlay
          playsInline
          loop
        />
      )}

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          border: `3px solid ${scanningStarted ? '#00ff00' : '#ff0000'}`,
          width: '50vw',
          height: '50vh',
          zIndex: 10
        }}
      />

      {/* Debug Panel */}
      <div
        style={{
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
        }}
      >
        <div>Status: {debugInfo}</div>
        <div>Model Loaded: {model ? 'Yes' : 'No'}</div>
        <div>Images Loaded: {referenceImages.length}</div>
        <div>Camera Active: {videoRef.current?.readyState === 4 ? 'Yes' : 'No'}</div>
        <div>Scanning: {scanningStarted ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};

export default ARViewer;