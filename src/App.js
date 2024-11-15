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

  // Get content key from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const contentKey = urlParams.get('key');

  // Initialize TensorFlow and load MobileNet model
  useEffect(() => {
    const initTF = async () => {
      try {
        await tf.setBackend('webgl');
        const loadedModel = await mobilenet.load();
        setModel(loadedModel);
        setLoading(false);
      } catch (err) {
        setError('Failed to initialize TensorFlow: ' + err.message);
        setLoading(false);
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
        setTargetImage(content.imageUrl);
        setArVideo(content.videoUrl);
      } catch (err) {
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
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        
        // Store video ref in a variable that's stable throughout the effect
        const videoElement = videoRef.current;
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      } catch (err) {
        setError('Failed to access camera: ' + err.message);
      }
    };

    initCamera();

    // Cleanup function uses the stream variable from the closure
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Image matching function wrapped in useCallback
  const matchImages = useCallback(async (capturedImage, targetImage) => {
    if (!model) return false;

    try {
      // Get features from captured frame
      const capturedTensor = tf.browser.fromPixels(capturedImage);
      const capturedFeatures = await model.infer(capturedTensor, true);

      // Get features from target image
      const targetTensor = tf.browser.fromPixels(targetImage);
      const targetFeatures = await model.infer(targetTensor, true);

      // Calculate similarity
      const similarity = tf.metrics.cosineProximity(
        capturedFeatures.reshape([1, -1]),
        targetFeatures.reshape([1, -1])
      ).dataSync()[0];

      // Cleanup tensors
      tf.dispose([capturedTensor, targetTensor, capturedFeatures, targetFeatures]);

      return similarity > 0.85; // Adjust threshold as needed
    } catch (err) {
      console.error('Error matching images:', err);
      return false;
    }
  }, [model]); // Only recreate if model changes

  // Main detection loop
  useEffect(() => {
    if (!model || !targetImage || !videoRef.current || !canvasRef.current) return;

    let animationFrame;
    let isActive = true; // Flag to track if effect is still active
    const targetImg = new Image();
    targetImg.src = targetImage;
    
    const detect = async () => {
      if (!isActive) return; // Check if effect is still active

      const context = canvasRef.current?.getContext('2d');
      if (!context || !videoRef.current) return;

      context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

      const isMatch = await matchImages(canvasRef.current, targetImg);
      
      if (isMatch && !isMatching) {
        setIsMatching(true);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play();
        }
      } else if (!isMatch && isMatching) {
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

    // Cleanup function
    return () => {
      isActive = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [model, targetImage, isMatching, matchImages]); // Added matchImages to dependencies

  if (loading) {
    return <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
      <div className="text-white text-xl">Loading AR Viewer...</div>
    </div>;
  }

  if (error) {
    return <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
      <div className="text-red-500 text-xl">{error}</div>
    </div>;
  }

  return (
    <div className="relative h-screen w-screen">
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Canvas for image processing */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="hidden"
      />

      {/* AR Video Overlay */}
      {isMatching && (
        <video
          ref={overlayVideoRef}
          src={arVideo}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          loop
        />
      )}

      {/* UI Elements */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
        <div className="bg-black bg-opacity-50 text-white px-4 py-2 rounded">
          {isMatching ? 'Match Found!' : 'Scanning...'}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;