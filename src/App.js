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
  const animationFrameRef = useRef(null);
  
  const [model, setModel] = useState(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [isScanning, setIsScanning] = useState(false);
  const [referenceImages, setReferenceImages] = useState([]);
  const [scanningStatus, setScanningStatus] = useState({
    modelReady: false,
    videoReady: false,
    imagesLoaded: false,
    canvasReady: false
  });

  // Initialize TensorFlow
  useEffect(() => {
    const initializeTF = async () => {
      try {
        setDebugInfo('Loading TensorFlow...');
        await tf.ready();
        await tf.setBackend('webgl');
        const loadedModel = await mobilenet.load();
        setModel(loadedModel);
        setScanningStatus(prev => ({ ...prev, modelReady: true }));
        setDebugInfo('TensorFlow ready');
        setIsLoading(false);
      } catch (error) {
        console.error('TensorFlow initialization error:', error);
        setDebugInfo(`TensorFlow error: ${error.message}`);
      }
    };

    initializeTF();
  }, []);

  // Load content from Firebase
  useEffect(() => {
    const loadARContent = async () => {
      setDebugInfo('Loading content from Firebase...');
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        console.log('Found Firebase documents:', querySnapshot.size);
        
        if (querySnapshot.size === 0) {
          setDebugInfo('No images found in Firebase');
          return;
        }

        const loadedImages = await Promise.all(
          querySnapshot.docs.map(async (doc) => {
            const data = doc.data();
            console.log('Loading image for document:', doc.id, data);
            
            try {
              const response = await fetch(data.imageUrl);
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const blob = await response.blob();
              const img = await createImageBitmap(blob);
              console.log('Successfully loaded image for:', doc.id);
              return {
                id: doc.id,
                imageUrl: data.imageUrl,
                videoUrl: data.videoUrl,
                bitmap: img
              };
            } catch (error) {
              console.error('Error loading image for doc:', doc.id, error);
              setDebugInfo(`Error loading image ${doc.id}: ${error.message}`);
              return null;
            }
          })
        );

        const validImages = loadedImages.filter(img => img !== null);
        console.log('Successfully loaded images:', validImages.length);
        setReferenceImages(validImages);
        setScanningStatus(prev => ({ ...prev, imagesLoaded: true }));
        setDebugInfo(`Loaded ${validImages.length} images successfully`);
        
      } catch (error) {
        console.error('Firebase loading error:', error);
        setDebugInfo(`Firebase error: ${error.message}`);
      }
    };

    loadARContent();
  }, []);

  const compareImages = useCallback(async (capturedImage, referenceImage) => {
    if (!model) return 0;

    try {
      return tf.tidy(() => {
        const captured = tf.browser.fromPixels(capturedImage);
        const reference = tf.browser.fromPixels(referenceImage);

        const capturedResized = tf.image.resizeBilinear(captured, [224, 224]);
        const referenceResized = tf.image.resizeBilinear(reference, [224, 224]);

        const capturedNorm = capturedResized.toFloat().div(tf.scalar(255));
        const referenceNorm = referenceResized.toFloat().div(tf.scalar(255));

        const capturedFeatures = model.infer(capturedNorm, true);
        const referenceFeatures = model.infer(referenceNorm, true);

        // Calculate cosine similarity
        const a = capturedFeatures.reshape([capturedFeatures.size]);
        const b = referenceFeatures.reshape([referenceFeatures.size]);
        const normA = a.norm();
        const normB = b.norm();
        const similarity = a.dot(b).div(normA.mul(normB));

        return similarity.dataSync()[0];
      });
    } catch (error) {
      console.error('Error comparing images:', error);
      return 0;
    }
  }, [model]);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!model || !video || !canvas || referenceImages.length === 0) {
      const reasons = [];
      if (!model) reasons.push('Model not ready');
      if (!video) reasons.push('Video not ready');
      if (!canvas) reasons.push('Canvas not ready');
      if (referenceImages.length === 0) reasons.push('No reference images');
      console.log('Scanning prerequisites not met:', reasons.join(', '));
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (!isScanning) {
      setIsScanning(true);
      console.log('Scanning started');
    }

    try {
      const context = canvas.getContext('2d');
      
      // Make sure video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log('Video dimensions not ready');
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get the center portion of the frame
      const centerWidth = canvas.width * 0.5;
      const centerHeight = canvas.height * 0.5;
      const x = (canvas.width - centerWidth) / 2;
      const y = (canvas.height - centerHeight) / 2;
      
      const frameData = context.getImageData(x, y, centerWidth, centerHeight);

      // Compare with each reference image
      for (const refImage of referenceImages) {
        const similarity = await compareImages(frameData, refImage.bitmap);
        console.log(`Similarity with ${refImage.id}:`, similarity);
        setDebugInfo(`Scanning... Similarity with ${refImage.id}: ${(similarity * 100).toFixed(1)}%`);

        if (similarity > 0.6) { // Lowered threshold for testing
          console.log('Match found!', refImage.id, similarity);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.src = refImage.videoUrl;
            try {
              await overlayVideoRef.current.play();
              setIsVideoPlaying(true);
              setDebugInfo(`Playing video for ${refImage.id}`);
            } catch (error) {
              console.error('Video playback error:', error);
              setDebugInfo(`Video error: ${error.message}`);
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error('Scan frame error:', error);
      setDebugInfo(`Scan error: ${error.message}`);
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [model, referenceImages, compareImages, isScanning]);

  // Start camera
  useEffect(() => {
    if (isLoading) return;

    let videoElement = null;
    let stream = null;

    const startCamera = async () => {
      try {
        setDebugInfo('Requesting camera access...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (videoRef.current) {
          videoElement = videoRef.current;
          videoElement.srcObject = stream;
          videoElement.onloadedmetadata = () => {
            videoElement.play()
              .then(() => {
                setScanningStatus(prev => ({ ...prev, videoReady: true }));
                setDebugInfo('Camera ready, starting scan...');
                console.log('Starting scan...');
                requestAnimationFrame(scanFrame);
              })
              .catch(error => {
                console.error('Error playing video:', error);
                setDebugInfo(`Video error: ${error.message}`);
              });
          };
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    startCamera();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoElement?.srcObject) {
        videoElement.srcObject = null;
      }
    };
  }, [isLoading, scanFrame]);

  // Monitor scanning status
  useEffect(() => {
    const { modelReady, videoReady, imagesLoaded } = scanningStatus;
    const readyStatus = [];
    
    if (!modelReady) readyStatus.push('Waiting for TensorFlow');
    if (!videoReady) readyStatus.push('Waiting for camera');
    if (!imagesLoaded) readyStatus.push('Waiting for images');
    
    if (readyStatus.length > 0) {
      setDebugInfo(`Status: ${readyStatus.join(', ')}`);
    } else {
      setDebugInfo('All systems ready - Scanning active');
    }
  }, [scanningStatus]);

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
          border: `3px solid ${isScanning ? '#00ff00' : '#ff0000'}`,
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
          zIndex: 30
        }}
      >
        <div>Status: {debugInfo}</div>
        <div>Images Loaded: {referenceImages.length}</div>
        <div>Model Ready: {scanningStatus.modelReady ? 'Yes' : 'No'}</div>
        <div>Camera Ready: {scanningStatus.videoReady ? 'Yes' : 'No'}</div>
        <div>Images Ready: {scanningStatus.imagesLoaded ? 'Yes' : 'No'}</div>
        <div>Scanning Active: {isScanning ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};

export default ARViewer;