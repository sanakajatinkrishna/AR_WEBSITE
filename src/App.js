import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

// Firebase Configuration
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
const storage = getStorage(app);

const TargetArea = () => (
  <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
    <div className="relative">
      <div className="w-64 h-96 border-4 border-red-500 rounded-lg relative" />
    </div>
  </div>
);

const ARViewer = () => {
  const videoRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [targetLocked, setTargetLocked] = useState(false);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const detectImageContent = useCallback((imageData, x, y, width, height) => {
    const data = imageData.data;
    let totalBrightness = 0;
    let totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / totalPixels;
    const hasContent = averageBrightness > 30 && averageBrightness < 225;

    if (hasContent) {
      return { x, y, width, height };
    }
    return null;
  }, []);

  const processFrame = useCallback(() => {
    if (!detectionCanvasRef.current || !videoRef.current) return;

    const canvas = detectionCanvasRef.current;
    const context = canvas.getContext('2d');
    const video = videoRef.current;

    // Define detection area (center of screen)
    const detectionArea = {
      x: (canvas.width - 256) / 2,
      y: (canvas.height - 384) / 2,
      width: 256,
      height: 384
    };

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(
      detectionArea.x,
      detectionArea.y,
      detectionArea.width,
      detectionArea.height
    );

    const detectedPosition = detectImageContent(
      imageData,
      detectionArea.x,
      detectionArea.y,
      detectionArea.width,
      detectionArea.height
    );

    if (detectedPosition) {
      if (!targetLocked) {
        setTargetLocked(true);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play();
        }
      }
      setImagePosition(detectedPosition);
    } else if (targetLocked) {
      setTargetLocked(false);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [targetLocked, detectImageContent]);

  useEffect(() => {
    if (!isInitialized) {
      const initCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
          });

          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            // Initialize canvas after video is ready
            if (detectionCanvasRef.current) {
              detectionCanvasRef.current.width = videoRef.current.videoWidth;
              detectionCanvasRef.current.height = videoRef.current.videoHeight;
              setIsInitialized(true);
              animationFrameRef.current = requestAnimationFrame(processFrame);
            }
          }
        } catch (err) {
          setError('Failed to access camera: ' + err.message);
        }
      };

      initCamera();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isInitialized, processFrame]);

  useEffect(() => {
    const fetchARContent = () => {
      const q = query(
        collection(db, 'arContent'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      return onSnapshot(q, async (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          
          try {
            const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = videoUrl;
              overlayVideoRef.current.load();
            }
          } catch (error) {
            setError('Failed to load video content');
          }
        }
      });
    };

    const unsubscribe = fetchARContent();
    return () => unsubscribe();
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Main camera feed */}
      <video
        ref={videoRef}
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Hidden canvas for detection */}
      <canvas
        ref={detectionCanvasRef}
        className="hidden"
      />

      {/* Target area overlay */}
      {!targetLocked && <TargetArea />}

      {/* AR Video overlay */}
      {targetLocked && (
        <video
          ref={overlayVideoRef}
          className="absolute z-20"
          style={{
            left: `${imagePosition.x}px`,
            top: `${imagePosition.y}px`,
            width: `${imagePosition.width}px`,
            height: `${imagePosition.height}px`,
            transition: 'all 0.1s ease-out'
          }}
          playsInline
          loop
        />
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-0 right-0 z-50 flex justify-center">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ARViewer;