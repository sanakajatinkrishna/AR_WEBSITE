import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Initialize Firebase (replace with your config)
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
const storage = getStorage(app);

const db = getFirestore(app);

const ImageMatcher = () => {
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // State management
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(false);
  const [referenceImageData, setReferenceImageData] = useState(null);

  // RGB to HSV conversion for better color comparison
  const rgbToHsv = (r, g, b) => {
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
  };

  // Image comparison function
  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 8;
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30;
    const satTolerance = 30;
    const valTolerance = 30;
    
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

    const rawPercentage = (matchCount / totalBlocks) * 100;
    return Math.min(100, rawPercentage * 1.5);
  }, []);

  // Camera stream management
  const startCamera = async () => {
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
          videoRef.current.play();
          setIsStreaming(true);
          setError(null);
        };
      }
    } catch (err) {
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  };

  // Frame capture and comparison
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImageData) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Match canvas dimensions to video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Capture current frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    // Compare with reference image
    const score = compareImages(capturedFrame, referenceImageData.data);
    setMatchScore(score);
  }, [compareImages, referenceImageData]);

  // Fetch reference images from Firestore
  useEffect(() => {
    const fetchImages = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const images = [];
        
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          if (data.isActive && data.imageUrl) {
            images.push({
              id: doc.id,
              url: data.imageUrl,
              contentKey: data.contentKey,
              fileName: data.fileName?.image
            });
          }
        }
        
        setReferenceImages(images);
        if (images.length > 0) {
          setSelectedImage(images[0]);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching images:', err);
        setError('Failed to load reference images');
        setLoading(false);
      }
    };

    fetchImages();
  }, []);

  // Load and process reference image
  useEffect(() => {
    const loadReferenceImage = async () => {
      if (!selectedImage) return;
      
      setImageLoading(true);
      setError(null);
      
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const imageLoadPromise = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image'));
        });

        // Get fresh download URL from Firebase
        let imageUrl = selectedImage.url;
        if (selectedImage.fileName) {
          try {
            const imageRef = ref(storage, selectedImage.fileName);
            imageUrl = await getDownloadURL(imageRef);
          } catch (err) {
            console.warn('Failed to get fresh download URL, using stored URL');
          }
        }

        img.src = imageUrl;
        await imageLoadPromise;

        // Process image data
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        setReferenceImageData({
          element: img,
          data: imageData,
          url: imageUrl
        });
        setImageLoading(false);
        setError(null);
      } catch (err) {
        console.error('Error loading reference image:', err);
        setError('Failed to load reference image. Please try again or select a different image.');
        setImageLoading(false);
      }
    };

    loadReferenceImage();
  }, [selectedImage]);

  // Set up continuous comparison when streaming
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImageData) {
      intervalId = setInterval(captureFrame, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImageData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading reference images...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          Image Matcher
        </h1>
      </div>

      <div>
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

        <div style={{ marginBottom: '20px' }}>
          <select 
            value={selectedImage?.id || ''} 
            onChange={(e) => {
              const selected = referenceImages.find(img => img.id === e.target.value);
              setSelectedImage(selected);
            }}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          >
            {referenceImages.map(img => (
              <option key={img.id} value={img.id}>
                Content Key: {img.contentKey}
              </option>
            ))}
          </select>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ 
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {imageLoading ? (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}>
                Loading image...
              </div>
            ) : referenceImageData ? (
              <img 
                src={referenceImageData.url}
                alt="Reference"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                crossOrigin="anonymous"
              />
            ) : null}
            <p style={{ textAlign: 'center', marginTop: '8px' }}>Reference Image</p>
          </div>
          <div style={{ 
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden'
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

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            disabled={imageLoading}
            style={{
              padding: '8px 16px',
              backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: imageLoading ? 'not-allowed' : 'pointer',
              opacity: imageLoading ? 0.5 : 1
            }}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        </div>

        {matchScore !== null && (
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#f3f4f6',
            borderRadius: '8px'
          }}>
            <h3 style={{ marginBottom: '8px' }}>Match Score: {matchScore.toFixed(1)}%</h3>
            <p style={{ color: '#4b5563' }}>
              {matchScore > 70 ? "It's a match!" : 
               matchScore > 40 ? "Partial match" : "No match found"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageMatcher;