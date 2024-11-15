import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  // Get content key from URL
  const getContentKey = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('key');
  }, []);

  // Load marker image with improved error handling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadMarkerImage = useCallback(async (imageUrl) => {
    if (!imageUrl) {
      setError('No image URL provided');
      return null;
    }

    setIsLoading(true);

    try {
      // If the URL is a Firebase Storage path, get the download URL
      if (imageUrl.startsWith('gs://')) {
        const storageRef = ref(storage, imageUrl);
        imageUrl = await getDownloadURL(storageRef);
      }

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
          setReferenceImage(img);
          setImageUrl(imageUrl);
          setIsLoading(false);
          setError(null);
          resolve(img);
        };
        
        img.onerror = (error) => {
          console.error('Error loading image:', error);
          setError('Failed to load image');
          setIsLoading(false);
          reject(error);
        };
        
        img.src = imageUrl;
      });
    } catch (error) {
      console.error('Error processing image URL:', error);
      setError('Error loading image from Firebase');
      setIsLoading(false);
      return null;
    }
  }, []);

  // Handle marker selection with improved Firebase handling
  const handleMarkerSelect = useCallback(async (marker) => {
    if (!marker?.imageUrl) {
      setError('Invalid marker data');
      return;
    }
    
    setSelectedMarker(marker);
    await loadMarkerImage(marker.imageUrl);
  }, [loadMarkerImage]);

  // Compare images with improved error handling
  const compareImages = useCallback((imgData1, imgData2) => {
    if (!imgData1 || !imgData2 || imgData1.width !== imgData2.width || imgData1.height !== imgData2.height) {
      setError('Invalid image data for comparison');
      return 0;
    }

    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 8;
    let matchCount = 0;
    let totalBlocks = 0;

    try {
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
    } catch (error) {
      setError('Error comparing images');
      return 0;
    }
  }, []);

  // Capture and compare frame with improved error handling
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImage) {
      setError('Video or canvas not ready');
      return;
    }

    try {
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
      setError(null);
    } catch (error) {
      console.error('Error capturing frame:', error);
      setError('Error capturing frame');
    }
  }, [compareImages, referenceImage]);

  // Start camera with improved error handling
  const startCamera = useCallback(async () => {
    if (!selectedMarker) {
      setError('No marker selected');
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
      console.error('Camera error:', err);
      setError('Failed to access camera');
    }
  }, [selectedMarker]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setMatchScore(null);
    }
  }, []);

  // Firebase listener
  useEffect(() => {
    const key = getContentKey();
    if (!key) {
      setError('No content key provided');
      return;
    }

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
      } else {
        setError('No active content found for this key');
      }
    }, (error) => {
      console.error('Firebase error:', error);
      setError('Error loading content');
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

      {error && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#fee2e2', 
          color: '#dc2626', 
          borderRadius: '4px', 
          marginBottom: '20px',
          textAlign: 'center'
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
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#666'
            }}>
              Loading image...
            </div>
          )}
          {!isLoading && imageUrl && (
            <>
              <img 
                src={imageUrl}
                alt="Reference"
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  display: isLoading ? 'none' : 'block'
                }}
                onError={() => setError('Failed to load image')}
              />
              <p style={{ textAlign: 'center', marginTop: '8px' }}>Reference Image</p>
            </>
          )}
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
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          disabled={!selectedMarker || isLoading}
          style={{
            padding: '8px 16px',
            backgroundColor: isStreaming ? '#dc2626' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (selectedMarker && !isLoading) ? 'pointer' : 'not-allowed',
            opacity: (selectedMarker && !isLoading) ? 1 : 0.5
          }}
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
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