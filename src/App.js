import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';

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

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [markerImages, setMarkerImages] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);

  // Normalize image data
  const normalizeImageData = useCallback((imgData, targetWidth, targetHeight) => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;

    const tempImg = document.createElement('canvas');
    tempImg.width = imgData.width;
    tempImg.height = imgData.height;
    const tempImgCtx = tempImg.getContext('2d');
    tempImgCtx.putImageData(imgData, 0, 0);

    tempCtx.drawImage(tempImg, 0, 0, targetWidth, targetHeight);
    return tempCtx.getImageData(0, 0, targetWidth, targetHeight);
  }, []);

  // RGB to HSV conversion
  const rgbToHsv = useCallback((r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = 60 * ((g - b) / diff + (g < b ? 6 : 0));
          break;
        case g:
          h = 60 * ((b - r) / diff + 2);
          break;
        case b:
          h = 60 * ((r - g) / diff + 4);
          break;
        default:
          break;
      }
    }

    return [h, s * 100, v * 100];
  }, []);

  // Compare images
  const compareImages = useCallback((imgData1, imgData2) => {
    const targetWidth = 320;
    const targetHeight = 240;
    
    const normalizedImg1 = normalizeImageData(imgData1, targetWidth, targetHeight);
    const normalizedImg2 = normalizeImageData(imgData2, targetWidth, targetHeight);

    const blockSize = 8;
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30;
    const satTolerance = 30;
    const valTolerance = 30;
    
    let matchCount = 0;
    let totalBlocks = 0;

    for (let y = 0; y < targetHeight; y += blockSize) {
      for (let x = 0; x < targetWidth; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < targetHeight; by++) {
          for (let bx = 0; bx < blockSize && x + bx < targetWidth; bx++) {
            const i = ((y + by) * targetWidth + (x + bx)) * 4;
            
            const r1 = normalizedImg1.data[i];
            const g1 = normalizedImg1.data[i + 1];
            const b1 = normalizedImg1.data[i + 2];
            
            const r2 = normalizedImg2.data[i];
            const g2 = normalizedImg2.data[i + 1];
            const b2 = normalizedImg2.data[i + 2];

            const hsv1 = rgbToHsv(r1, g1, b1);
            const hsv2 = rgbToHsv(r2, g2, b2);

            const hueDiff = Math.abs(hsv1[0] - hsv2[0]);
            const satDiff = Math.abs(hsv1[1] - hsv2[1]);
            const valDiff = Math.abs(hsv1[2] - hsv2[2]);

            const hueMatch = (hueDiff <= hueTolerance || hueDiff >= 360 - hueTolerance) ? 1 : 0;
            const satMatch = satDiff <= satTolerance ? 1 : 0;
            const valMatch = valDiff <= valTolerance ? 1 : 0;

            const pixelMatchScore = 
              hueMatch * hueWeight +
              satMatch * satWeight +
              valMatch * valWeight;

            blockMatchSum += pixelMatchScore;
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
  }, [normalizeImageData, rgbToHsv]);

  // Load marker image
  const loadMarkerImage = useCallback(async (imageUrl) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        setReferenceImage(img);
        setError(null);
      };
      
      img.onerror = () => {
        setError('Failed to load marker image');
        console.error('Error loading image:', imageUrl);
      };
      
      img.src = imageUrl;
    } catch (err) {
      setError('Error loading marker image');
      console.error('Image loading error:', err);
    }
  }, []);

  // Handle marker selection
  const handleMarkerSelect = useCallback((marker) => {
    setSelectedMarker(marker);
    loadMarkerImage(marker.imageUrl);
  }, [loadMarkerImage]);

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

  // Camera controls
  const startCamera = useCallback(async () => {
    if (!selectedMarker) {
      setError('Please select a marker image first');
      return;
    }

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
        setError(null);
      }
    } catch (err) {
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
      console.error('Error accessing camera:', err);
    }
  }, [selectedMarker]);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  }, []);

  // Firebase listener effect
  useEffect(() => {
    const arContentRef = collection(db, 'arContent');
    const activeContentQuery = query(
      arContentRef,
      where('isActive', '==', true),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(activeContentQuery, (snapshot) => {
      try {
        const images = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMarkerImages(images);
        
        if (images.length > 0 && !selectedMarker) {
          handleMarkerSelect(images[0]);
        }
      } catch (err) {
        console.error('Error processing Firestore data:', err);
        setError('Error loading marker images from database');
      }
    }, (err) => {
      console.error('Firestore listening error:', err);
      setError('Error connecting to database');
    });

    return () => unsubscribe();
  }, [handleMarkerSelect, selectedMarker]);

  // Capture frame interval effect
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImage) {
      intervalId = setInterval(captureFrame, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImage]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

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

      {/* Marker Selection */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          Select Marker Image
        </h3>
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '10px'
        }}>
          {markerImages.map((marker) => (
            <div
              key={marker.id}
              onClick={() => handleMarkerSelect(marker)}
              style={{
                cursor: 'pointer',
                border: selectedMarker?.id === marker.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <img
                src={marker.imageUrl}
                alt={`Marker ${marker.id}`}
                style={{ width: '100%', height: '120px', objectFit: 'cover' }}
              />
              <div style={{ padding: '8px', backgroundColor: '#f9fafb' }}>
                <p style={{ fontSize: '12px', color: '#666' }}>
                  {new Date(marker.timestamp?.seconds * 1000).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Comparison Section */}
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

      {/* Controls */}
      <div style={{ marginBottom: '20px' }}>
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

      {/* Match Score */}
      {matchScore !== null && (
        <div style={{
          padding: '16px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px'
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