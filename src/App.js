import React, { useEffect, useState, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import './App.css';

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

const SIMILARITY_THRESHOLD = 0.7;

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [showMessage, setShowMessage] = useState(true);
  const [currentContent, setCurrentContent] = useState(null);
  const [model, setModel] = useState(null);
  const [targetFeatures, setTargetFeatures] = useState(null);

  const videoRef = useRef(null);
  const sourceImageRef = useRef(null);
  const arVideoRef = useRef(null);
  const requestRef = useRef(null);
  const streamRef = useRef(null);

  const loadTargetImage = useCallback(async (imageUrl) => {
    try {
      // Load and store target image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
      sourceImageRef.current = img;

      // Get features from target image
      if (model) {
        const targetTensor = tf.browser.fromPixels(img);
        const features = await model.infer(targetTensor, true);
        setTargetFeatures(features);
        targetTensor.dispose();
      }
    } catch (error) {
      console.error('Error loading target image:', error);
    }
  }, [model]);

  const compareFeaturesWithTarget = useCallback((frameFeatures, targetFeatures) => {
    return tf.tidy(() => {
      // Calculate cosine similarity
      const a = frameFeatures.reshape([1, -1]);
      const b = targetFeatures.reshape([1, -1]);
      const normA = a.norm();
      const normB = b.norm();
      const similarity = a.matMul(b.transpose()).div(normA.mul(normB));
      return similarity.dataSync()[0];
    });
  }, []);

  const detectFrame = useCallback(async () => {
    if (!videoRef.current || !model || !targetFeatures || !sourceImageRef.current) return;

    try {
      // Get current frame
      const videoTensor = tf.browser.fromPixels(videoRef.current);
      
      // Get features from current frame
      const frameFeatures = await model.infer(videoTensor, true);
      
      // Compare features
      const similarity = await compareFeaturesWithTarget(frameFeatures, targetFeatures);

      if (similarity > SIMILARITY_THRESHOLD) {
        setShowMessage(false);
        if (arVideoRef.current) {
          const videoElement = arVideoRef.current;
          videoElement.style.display = 'block';
          
          if (videoElement.paused) {
            videoElement.play().catch(console.error);
          }
        }
      } else {
        setShowMessage(true);
        if (arVideoRef.current) {
          arVideoRef.current.style.display = 'none';
          arVideoRef.current.pause();
        }
      }

      // Cleanup
      videoTensor.dispose();
      frameFeatures.dispose();
    } catch (error) {
      console.error('Detection error:', error);
    }

    // Continue detection
    requestRef.current = requestAnimationFrame(detectFrame);
  }, [model, targetFeatures, compareFeaturesWithTarget]);

  const initializeCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = resolve;
        });
      }
    } catch (error) {
      console.error('Camera access error:', error);
    }
  }, []);

  const setupFirebaseListener = useCallback(() => {
    const q = query(
      collection(db, 'arContent'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    return onSnapshot(q, async (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length > 0) {
        const data = changes[0].doc.data();
        setCurrentContent(data);
        
        if (data.imageUrl) {
          await loadTargetImage(data.imageUrl);
        }
      }
    });
  }, [loadTargetImage]); // Added loadTargetImage to dependencies

  const initializeApp = useCallback(async () => {
    try {
      // Load TensorFlow model
      await tf.ready();
      const loadedModel = await mobilenet.load();
      setModel(loadedModel);

      // Initialize camera
      await initializeCamera();
      
      // Set up Firebase listener
      setupFirebaseListener();
      
      setIsLoading(false);
    } catch (error) {
      console.error('Initialization error:', error);
      setIsLoading(false);
    }
  }, [initializeCamera, setupFirebaseListener]);

  useEffect(() => {
    initializeApp();
    
    return () => {
      // Clean up requestAnimationFrame
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      
      // Clean up media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initializeApp]);

  useEffect(() => {
    if (model && targetFeatures) {
      detectFrame();
      return () => {
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }
      };
    }
  }, [model, targetFeatures, detectFrame]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading AR Experience...</p>
      </div>
    );
  }

  return (
    <div className="ar-container">
      {showMessage && (
        <div className="overlay-message">
          Point your camera at the target image
        </div>
      )}

      <video
        ref={videoRef}
        className="camera-feed"
        autoPlay
        playsInline
        muted
      />

      {currentContent && (
        <video
          ref={arVideoRef}
          className="ar-video"
          src={currentContent.videoUrl}
          playsInline
          loop
          muted
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '80vw',
            maxHeight: '80vh',
            display: 'none'
          }}
        />
      )}
    </div>
  );
}

export default App;