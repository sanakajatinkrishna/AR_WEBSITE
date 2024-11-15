import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs
} from 'firebase/firestore';

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

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [imageUrl, setImageUrl] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showVideo, setShowVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (key) {
      fetchContent(key);
    } else {
      setError('No content key provided');
      setLoading(false);
    }
  }, []);

  const fetchContent = async (key) => {
    try {
      setLoading(true);
      const q = query(collection(db, "arContent"), where("contentKey", "==", key));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('Content not found');
      }

      const data = querySnapshot.docs[0].data();
      
      if (!data.imageUrl || !data.videoUrl) {
        throw new Error('Missing content URLs');
      }

      setVideoUrl(data.videoUrl);
      setImageUrl(data.imageUrl);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching content:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    let totalPixels = width * height;
    let matchingPixels = 0;

    for (let i = 0; i < imgData1.data.length; i += 4) {
      const r1 = imgData1.data[i];
      const g1 = imgData1.data[i + 1];
      const b1 = imgData1.data[i + 2];
      
      const r2 = imgData2.data[i];
      const g2 = imgData2.data[i + 1];
      const b2 = imgData2.data[i + 2];
      
      const diff = Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
      );
      
      if (diff < 100) {
        matchingPixels++;
      }
    }

    return (matchingPixels / totalPixels) * 100;
  }, []);

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
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      setError('Unable to access camera. Please check permissions.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  }, []);

  useEffect(() => {
    let intervalId;
    if (isStreaming && imageLoaded) {
      intervalId = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);

          const score = compareImages(capturedFrame, referenceData);
          setMatchScore(score);
          
          if (score > 70) {
            setShowVideo(true);
            stopCamera();
          }
        };
        img.src = imageUrl;
      }, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, imageUrl, imageLoaded, compareImages, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  if (loading) {
    return <div className="text-xl font-semibold text-center p-4">Loading content...</div>;
  }

  if (error) {
    return <div className="text-red-600 text-center p-4">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-4 text-center">AR Image Matcher</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Reference"
                className="w-full h-full object-cover"
                onLoad={() => setImageLoaded(true)}
                crossOrigin="anonymous"
              />
            )}
            <p className="text-center mt-2 font-medium">Reference Image</p>
          </div>
          
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {showVideo && videoUrl ? (
              <video
                src={videoUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                controls
                playsInline
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
              </>
            )}
            <p className="text-center mt-2 font-medium">
              {showVideo ? "AR Content" : "Camera Feed"}
            </p>
          </div>
        </div>

        {!showVideo && imageLoaded && (
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            className={`w-full py-3 px-4 rounded-lg text-white font-semibold mb-4 ${
              isStreaming ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        )}

        {matchScore !== null && !showVideo && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">
              Match Score: {matchScore.toFixed(1)}%
            </h3>
            <p className={matchScore > 70 ? 'text-green-600' : 
                         matchScore > 40 ? 'text-yellow-600' : 'text-red-600'}>
              {matchScore > 70 ? "Match found! Loading AR content..." : 
               matchScore > 40 ? "Getting closer! Keep adjusting..." : 
               "No match yet - try repositioning"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageMatcher;