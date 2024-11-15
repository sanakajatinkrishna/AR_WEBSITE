import React, { useState, useEffect, useRef,useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as mobilenet from '@tensorflow-models/mobilenet';

// Initialize Firebase with your config
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

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [model, setModel] = useState(null);
  const [targetImage, setTargetImage] = useState(null);
  const [arVideo, setArVideo] = useState(null);
  const [isMatching, setIsMatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Get content key from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const contentKey = urlParams.get('key');

  // Initialize TensorFlow and load MobileNet model
  useEffect(() => {
    const initTF = async () => {
      try {
        console.log('Loading TensorFlow...');
        await tf.ready();
        console.log('TensorFlow ready, loading MobileNet...');
        const loadedModel = await mobilenet.load();
        console.log('MobileNet loaded');
        setModel(loadedModel);
        setModelLoaded(true);
      } catch (err) {
        console.error('TensorFlow initialization error:', err);
        setError('Failed to initialize TensorFlow: ' + err.message);
      }
    };

    initTF();
  }, []);

  // Fetch content from Firebase
  useEffect(() => {
    const fetchContent = async () => {
      if (!contentKey) {
        setError('No content key provided');
        return;
      }

      try {
        console.log('Fetching content for key:', contentKey);
        const q = query(
          collection(db, 'arContent'),
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setError('Content not found');
          return;
        }

        const content = querySnapshot.docs[0].data();
        console.log('Content fetched:', content);
        setTargetImage(content.imageUrl);
        setArVideo(content.videoUrl);
      } catch (err) {
        console.error('Firebase fetch error:', err);
        setError('Failed to fetch content: ' + err.message);
      }
    };

    fetchContent();
  }, [contentKey]);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const initCamera = async () => {
      try {
        console.log('Requesting camera access...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            console.log('Camera stream ready');
            setCameraReady(true);
          };
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Failed to access camera: ' + err.message);
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Image matching function
  const matchImages = useCallback(async (capturedImage, targetImage) => {
    if (!model) return false;

    try {
      const capturedTensor = tf.browser.fromPixels(capturedImage);
      const capturedFeatures = await model.infer(capturedTensor, true);

      const targetTensor = tf.browser.fromPixels(targetImage);
      const targetFeatures = await model.infer(targetTensor, true);

      const similarity = tf.metrics.cosineProximity(
        capturedFeatures.reshape([1, -1]),
        targetFeatures.reshape([1, -1])
      ).dataSync()[0];

      tf.dispose([capturedTensor, targetTensor, capturedFeatures, targetFeatures]);

      return similarity > 0.85;
    } catch (err) {
      console.error('Image matching error:', err);
      return false;
    }
  }, [model]);

  // Update loading state
  useEffect(() => {
    if (modelLoaded && cameraReady && targetImage) {
      console.log('All components ready');
      setLoading(false);
    }
  }, [modelLoaded, cameraReady, targetImage]);

  // Main detection loop
  useEffect(() => {
    if (loading || !model || !targetImage || !videoRef.current || !canvasRef.current) {
      console.log('Detection loop waiting for:', {
        loading,
        model: !!model,
        targetImage: !!targetImage,
        video: !!videoRef.current,
        canvas: !!canvasRef.current
      });
      return;
    }

    console.log('Starting detection loop');
    let animationFrame;
    let isActive = true;
    
    const targetImg = new Image();
    targetImg.src = targetImage;
    targetImg.onload = () => {
      console.log('Target image loaded');
    };

    const detect = async () => {
      if (!isActive || !canvasRef.current || !videoRef.current) return;

      const context = canvasRef.current.getContext('2d');
      if (!context) return;

      // Update canvas dimensions if needed
      if (canvasRef.current.width !== videoRef.current.videoWidth ||
          canvasRef.current.height !== videoRef.current.videoHeight) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
      }

      context.drawImage(videoRef.current, 0, 0);

      const isMatch = await matchImages(canvasRef.current, targetImg);
      
      if (isMatch && !isMatching) {
        console.log('Match found!');
        setIsMatching(true);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play().catch(console.error);
        }
      } else if (!isMatch && isMatching) {
        console.log('Match lost');
        setIsMatching(false);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
          overlayVideoRef.current.currentTime = 0;
        }
      }

      if (isActive) {
        animationFrame = requestAnimationFrame(detect);
      }
    };

    detect();

    return () => {
      isActive = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [loading, model, targetImage, isMatching, matchImages]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900">
        <div className="text-white text-xl mb-4">Loading AR Viewer...</div>
        <div className="text-gray-400 text-sm">
          {!modelLoaded && <div>Loading AI Model...</div>}
          {!cameraReady && <div>Initializing Camera...</div>}
          {!targetImage && <div>Loading Target Image...</div>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
        <div className="text-red-500 text-xl p-4 text-center">
          {error}
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {isMatching && arVideo && (
        <video
          ref={overlayVideoRef}
          src={arVideo}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          loop
          muted
        />
      )}

      <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
        <div className="bg-black bg-opacity-50 text-white px-4 py-2 rounded">
          {isMatching ? 'Match Found!' : 'Scanning...'}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;
