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

// Cosine similarity calculation function
const cosineSimilarity = (a, b) => {
  return tf.tidy(() => {
    const dotProduct = tf.sum(tf.mul(a, b));
    const normA = tf.sqrt(tf.sum(tf.square(a)));
    const normB = tf.sqrt(tf.sum(tf.square(b)));
    return tf.div(dotProduct, tf.mul(normA, normB));
  });
};

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  
  const [model, setModel] = useState(null);
  const [arContent, setArContent] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize TensorFlow model
  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        await tf.setBackend('webgl');
        const loadedModel = await mobilenet.load();
        setModel(loadedModel);
      } catch (error) {
        console.error('Error loading TensorFlow model:', error);
      }
    };

    loadModel();
  }, []);

  // Load content from Firebase
  useEffect(() => {
    const loadARContent = async () => {
      setIsLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];
        
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          try {
            const imageResponse = await fetch(data.imageUrl);
            const imageBlob = await imageResponse.blob();
            const imageBitmap = await createImageBitmap(imageBlob);
            
            content.push({
              id: doc.id,
              imageUrl: data.imageUrl,
              videoUrl: data.videoUrl,
              imageBitmap,
            });
          } catch (error) {
            console.error('Error loading image for document:', doc.id, error);
          }
        }
        
        setArContent(content);
      } catch (error) {
        console.error('Error loading AR content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadARContent();
  }, []);

  const detectImage = useCallback(async () => {
    if (!model || !videoRef.current || !canvasRef.current || arContent.length === 0) {
      requestAnimationFrame(detectImage);
      return;
    }

    const context = canvasRef.current.getContext('2d');
    
    context.drawImage(
      videoRef.current,
      0,
      0,
      canvasRef.current.width,
      canvasRef.current.height
    );

    try {
      const imageData = context.getImageData(
        canvasRef.current.width * 0.4,
        canvasRef.current.height * 0.25,
        canvasRef.current.width * 0.2,
        canvasRef.current.height * 0.5
      );

      const tensor = tf.browser.fromPixels(imageData);
      const features = model.infer(tensor, true);
      
      for (const content of arContent) {
        const contentTensor = tf.browser.fromPixels(content.imageBitmap);
        const contentFeatures = model.infer(contentTensor, true);
        
        const similarity = await cosineSimilarity(features, contentFeatures).data();
        
        contentTensor.dispose();
        contentFeatures.dispose();

        if (similarity[0] > 0.85) {
          if (currentVideo?.id !== content.id) {
            setCurrentVideo(content);
            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = content.videoUrl;
              await overlayVideoRef.current.play();
              setIsVideoPlaying(true);
            }
          }
          break;
        }
      }

      tensor.dispose();
      features.dispose();

    } catch (error) {
      console.error('Error in image detection:', error);
    }

    requestAnimationFrame(detectImage);
  }, [model, arContent, currentVideo]); // Added dependencies

  // Initialize camera
  useEffect(() => {
    let stream = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              if (containerRef.current && containerRef.current.requestFullscreen) {
                await containerRef.current.requestFullscreen();
              } else if (containerRef.current && containerRef.current.webkitRequestFullscreen) {
                await containerRef.current.webkitRequestFullscreen();
              }
              requestAnimationFrame(detectImage);
            } catch (err) {
              console.error('Error starting video:', err);
            }
          };
        }
      } catch (error) {
        console.error('Camera error:', error);
      }
    };

    if (!isLoading && model) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isLoading, model, detectImage]); // Added detectImage to dependencies

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
        color: 'white',
        fontSize: '20px'
      }}>
        Loading AR Experience...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'black'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
      
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        width={window.innerWidth}
        height={window.innerHeight}
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
          zIndex: 20,
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            width: '20vw',
            height: '50vh',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            backgroundColor: 'transparent'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;