import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

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
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
const db = getFirestore(app);

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(0);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [referenceImageData, setReferenceImageData] = useState(null);

  // Get content key from URL
  const getContentKey = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('key');
  }, []);

  // Compare images with improved matching algorithm
  const compareImages = useCallback((capturedImageData, refImageData) => {
    if (!capturedImageData || !refImageData) return 0;

    const width = capturedImageData.width;
    const height = capturedImageData.height;
    const blockSize = 16; // Increased block size for better performance
    let matchCount = 0;
    let totalBlocks = 0;

    // Calculate average color for a block
    const getBlockAverage = (imageData, startX, startY, blockSize) => {
      let rSum = 0, gSum = 0, bSum = 0;
      let pixelCount = 0;

      for (let y = startY; y < Math.min(startY + blockSize, height); y++) {
        for (let x = startX; x < Math.min(startX + blockSize, width); x++) {
          const i = (y * width + x) * 4;
          rSum += imageData.data[i];
          gSum += imageData.data[i + 1];
          bSum += imageData.data[i + 2];
          pixelCount++;
        }
      }

      return {
        r: rSum / pixelCount,
        g: gSum / pixelCount,
        b: bSum / pixelCount
      };
    };

    // Compare blocks
    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        const block1 = getBlockAverage(capturedImageData, x, y, blockSize);
        const block2 = getBlockAverage(refImageData, x, y, blockSize);

        // Calculate color difference using weighted RGB
        const colorDiff = Math.sqrt(
          Math.pow((block1.r - block2.r) * 0.3, 2) +
          Math.pow((block1.g - block2.g) * 0.59, 2) +
          Math.pow((block1.b - block2.b) * 0.11, 2)
        );

        // Adjust threshold for better matching
        if (colorDiff < 50) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return Math.min(100, (matchCount / totalBlocks) * 100 * 1.2);
  }, []);

  // Load and process reference image
  const loadReferenceImage = useCallback((imageUrl) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      const tempContext = tempCanvas.getContext('2d');
      
      // Set canvas size to match video dimensions
      if (videoRef.current) {
        tempCanvas.width = videoRef.current.videoWidth || 640;
        tempCanvas.height = videoRef.current.videoHeight || 480;
      } else {
        tempCanvas.width = 640;
        tempCanvas.height = 480;
      }

      // Draw and store reference image data
      tempContext.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
      setReferenceImageData(tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height));
    };
    img.src = imageUrl;
  }, []);

  // Capture and compare frame with improved handling
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImageData) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Ensure canvas matches video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Capture and process frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Compare with stored reference image
    const score = compareImages(capturedFrame, referenceImageData);
    setMatchScore(score);
  }, [compareImages, referenceImageData]);

  // Start camera with error handling
  const startCamera = useCallback(async () => {
    if (!selectedMarker) return;

    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsStreaming(true);
          // Reload reference image with correct dimensions
          if (selectedMarker?.imageUrl) {
            loadReferenceImage(selectedMarker.imageUrl);
          }
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      alert('Failed to access camera. Please ensure camera permissions are granted.');
    }
  }, [selectedMarker, loadReferenceImage]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  }, []);

  // Firebase listener
  useEffect(() => {
    const key = getContentKey();
    if (!key) return;
    
    const arContentRef = collection(db, 'arContent');
    const markerQuery = query(
      arContentRef,
      where('contentKey', '==', key),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(markerQuery, (snapshot) => {
      if (!snapshot.empty) {
        const markerData = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data()
        };
        setSelectedMarker(markerData);
        if (markerData.imageUrl) {
          loadReferenceImage(markerData.imageUrl);
        }
      }
    });

    return () => unsubscribe();
  }, [getContentKey, loadReferenceImage]);

  // Continuous capture interval
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImageData) {
      intervalId = setInterval(captureFrame, 200); // Adjusted frequency
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImageData]);

  // Cleanup
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
        AR Image Matcher
      </h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px'
      }}>
        <div style={{
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          overflow: 'hidden',
          aspectRatio: '16/9',
          position: 'relative'
        }}>
          {selectedMarker?.imageUrl && (
            <img 
              src={selectedMarker.imageUrl}
              alt="Reference"
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain',
                position: 'absolute',
                top: '0',
                left: '0'
              }}
            />
          )}
          <p style={{ 
            textAlign: 'center', 
            marginTop: '8px', 
            position: 'absolute',
            bottom: '0',
            width: '100%',
            background: 'rgba(255,255,255,0.8)'
          }}>
            Reference Image
          </p>
        </div>
        <div style={{
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          overflow: 'hidden',
          aspectRatio: '16/9',
          position: 'relative'
        }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            autoPlay
            playsInline
          />
          <canvas
            ref={canvasRef}
            style={{ display: 'none' }}
          />
          <p style={{ 
            textAlign: 'center', 
            marginTop: '8px',
            position: 'absolute',
            bottom: '0',
            width: '100%',
            background: 'rgba(255,255,255,0.8)'
          }}>
            Camera Feed
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          disabled={!selectedMarker}
          style={{
            padding: '8px 16px',
            backgroundColor: isStreaming ? '#dc2626' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedMarker ? 'pointer' : 'not-allowed',
            opacity: selectedMarker ? 1 : 0.5
          }}
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
      </div>

      <div style={{
        padding: '16px',
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        textAlign: 'center',
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '400px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 1000
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
          Match Score: {matchScore.toFixed(1)}%
        </h3>
        <p style={{ color: '#4b5563' }}>
          {matchScore > 70 ? "It's a match!" : 
           matchScore > 40 ? "Partial match" : "No match found"}
        </p>
      </div>
    </div>
  );
};

export default ImageMatcher;