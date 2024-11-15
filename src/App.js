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
  const [error, setError] = useState(null);

  // Compare images using HSV color space
  const compareImages = useCallback((capturedFrame, referenceCanvas) => {
    const width = capturedFrame.width;
    const height = capturedFrame.height;
    const blockSize = 8;
    const tolerance = 30;
    
    let matchCount = 0;
    let totalBlocks = 0;

    // Get reference frame data
    const refContext = referenceCanvas.getContext('2d');
    const referenceFrame = refContext.getImageData(0, 0, width, height);

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            
            const diff = Math.abs(capturedFrame.data[i] - referenceFrame.data[i]) +
                        Math.abs(capturedFrame.data[i + 1] - referenceFrame.data[i + 1]) +
                        Math.abs(capturedFrame.data[i + 2] - referenceFrame.data[i + 2]);

            blockMatchSum += diff < tolerance * 3 ? 1 : 0;
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return Math.min(100, (matchCount / totalBlocks) * 100 * 1.5);
  }, []);

  // Capture and compare frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !selectedMarker) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    // Create reference canvas with same dimensions
    const referenceCanvas = document.createElement('canvas');
    referenceCanvas.width = canvas.width;
    referenceCanvas.height = canvas.height;
    const refContext = referenceCanvas.getContext('2d');

    // Create and load reference image
    const refImg = new Image();
    refImg.crossOrigin = "anonymous";
    
    refImg.onload = () => {
      refContext.drawImage(refImg, 0, 0, canvas.width, canvas.height);
      const score = compareImages(capturedFrame, referenceCanvas);
      setMatchScore(score);
    };

    refImg.src = selectedMarker.imageUrl;
  }, [compareImages, selectedMarker]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (!selectedMarker) return;

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
        videoRef.current.onloadedmetadata = () => {
          setIsStreaming(true);
          setError(null);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please ensure camera permissions are granted.');
    }
  }, [selectedMarker]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  }, []);

  // Get content key from URL
  const getContentKey = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('key');
  }, []);

  // Firebase listener
  useEffect(() => {
    const key = getContentKey();
    if (!key) return;
    
    console.log('Fetching content for key:', key);
    
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
        console.log('Marker data received:', markerData);
        setSelectedMarker(markerData);
      } else {
        console.log('No active content found for key:', key);
        setError('No active content found');
      }
    });

    return () => unsubscribe();
  }, [getContentKey]);

  // Continuous capture interval
  useEffect(() => {
    let intervalId;
    if (isStreaming && selectedMarker) {
      intervalId = setInterval(captureFrame, 200);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, selectedMarker]);

  // Cleanup
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Debug log for marker data
  useEffect(() => {
    if (selectedMarker) {
      console.log('Selected marker updated:', {
        id: selectedMarker.id,
        imageUrl: selectedMarker.imageUrl,
        isActive: selectedMarker.isActive
      });
    }
  }, [selectedMarker]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
        AR Image Matcher
      </h1>

      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fee2e2', 
          color: '#dc2626', 
          borderRadius: '4px',
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

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
          {selectedMarker?.imageUrl ? (
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
              crossOrigin="anonymous"
              onError={(e) => {
                console.error('Error loading image:', e);
                setError('Failed to load reference image');
              }}
            />
          ) : (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#6b7280'
            }}>
              No reference image
            </div>
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