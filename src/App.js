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
  const [matchScore, setMatchScore] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [contentKey, setContentKey] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get content key from URL
  const getContentKey = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('key');
  }, []);

  // Load marker image
  const loadMarkerImage = useCallback(async (imageUrl) => {
    if (!imageUrl) return;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        setReferenceImage(img);
        setIsLoading(false);
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = imageUrl;
    });
  }, []);

  // Handle marker selection
  const handleMarkerSelect = useCallback(async (marker) => {
    if (!marker?.imageUrl) return;
    
    setSelectedMarker(marker);
    try {
      await loadMarkerImage(marker.imageUrl);
    } catch (error) {
      console.error('Error loading marker image:', error);
    }
  }, [loadMarkerImage]);

  // Compare images
  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 8;
    let matchCount = 0;
    let totalBlocks = 0;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            
            const r1 = imgData1.data[i];
            const g1 = imgData1.data[i + 1];
            const b1 = imgData1.data[i + 2];
            
            const r2 = imgData2.data[i];
            const g2 = imgData2.data[i + 1];
            const b2 = imgData2.data[i + 2];

            const colorDiff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
            const match = colorDiff < 150 ? 1 : 0;

            blockMatchSum += match;
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
    if (!videoRef.current || !canvasRef.current || !referenceImage) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(referenceImage, 0, 0, canvas.width, canvas.height);
    const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const score = compareImages(capturedFrame, referenceData);
    setMatchScore(score);
  }, [compareImages, referenceImage]);

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
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
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

  // Firebase listener
  useEffect(() => {
    const key = getContentKey();
    if (!key) return;

    setContentKey(key);
    
    const arContentRef = collection(db, 'arContent');
    const markerQuery = query(
      arContentRef,
      where('contentKey', '==', key),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(markerQuery, async (snapshot) => {
      if (!snapshot.empty) {
        const markerData = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data()
        };
        await handleMarkerSelect(markerData);
      }
    });

    return () => unsubscribe();
  }, [getContentKey, handleMarkerSelect]);

  // Capture interval
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImage) {
      intervalId = setInterval(captureFrame, 500);
    }
    return () => intervalId && clearInterval(intervalId);
  }, [isStreaming, captureFrame, referenceImage]);

  // Cleanup
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
        AR Image Matcher
      </h1>

      {isLoading && (
        <div style={{ textAlign: 'center', marginBottom: '20px', color: '#666' }}>
          Loading marker image...
        </div>
      )}

      {contentKey && !isLoading && (
        <div style={{ textAlign: 'center', marginBottom: '20px', color: '#666' }}>
          <p>Content Key: {contentKey}</p>
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
          aspectRatio: '16/9'
        }}>
          {selectedMarker && (
            <img 
              src={selectedMarker.imageUrl}
              alt="Reference"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <p style={{ textAlign: 'center', marginTop: '8px' }}>Reference Image</p>
        </div>
        <div style={{
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          overflow: 'hidden',
          aspectRatio: '16/9'
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
          <p style={{ textAlign: 'center', marginTop: '8px' }}>Camera Feed</p>
        </div>
      </div>

      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        {!isLoading && (
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
        )}
      </div>

      {matchScore !== null && (
        <div style={{
          padding: '16px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
            Match Score: {matchScore.toFixed(1)}%
          </h3>
          <p style={{ color: '#4b5563' }}>
            {matchScore > 70 ? "It's a match!" : 
             matchScore > 40 ? "Partial match" : "No match found"}
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageMatcher;