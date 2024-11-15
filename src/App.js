import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, increment } from 'firebase/firestore';

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
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [docId, setDocId] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showVideo, setShowVideo] = useState(false);

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
            
            const hsv1 = rgbToHsv(
              imgData1.data[i],
              imgData1.data[i + 1],
              imgData1.data[i + 2]
            );
            
            const hsv2 = rgbToHsv(
              imgData2.data[i],
              imgData2.data[i + 1],
              imgData2.data[i + 2]
            );

            const hueDiff = Math.abs(hsv1[0] - hsv2[0]);
            const satDiff = Math.abs(hsv1[1] - hsv2[1]);
            const valDiff = Math.abs(hsv1[2] - hsv2[2]);

            if ((hueDiff <= 30 || hueDiff >= 330) && satDiff <= 30 && valDiff <= 30) {
              blockMatchSum++;
            }
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return (matchCount / totalBlocks) * 100;
  }, [rgbToHsv]);

  const updateViewCount = useCallback(async () => {
    if (docId) {
      try {
        const docRef = doc(db, "arContent", docId);
        await updateDoc(docRef, {
          views: increment(1)
        });
      } catch (err) {
        console.error("Error updating view count:", err);
      }
    }
  }, [docId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (key) {
      fetchReferenceImage(key);
    }
  }, []);

  const fetchReferenceImage = async (key) => {
    try {
      const q = query(collection(db, "arContent"), where("contentKey", "==", key));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        setDocId(doc.id);
        setVideoUrl(data.videoUrl);
        
        if (data.imageUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => setReferenceImage(img);
          img.src = data.imageUrl;
        }
      }
    } catch (err) {
      setError('Error loading reference image');
      console.error(err);
    }
  };

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
      console.error(err);
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
    if (isStreaming && referenceImage) {
      intervalId = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

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
        
        if (score > 70 && !showVideo) {
          setShowVideo(true);
          updateViewCount();
        }
      }, 500);
    }
    return () => clearInterval(intervalId);
  }, [isStreaming, referenceImage, compareImages, showVideo, updateViewCount]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Rest of the return JSX remains the same...

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-4">AR Image Matcher</h1>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden relative">
            {referenceImage && (
              <img
                src={referenceImage.src}
                alt="Reference"
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            )}
            <p className="text-center mt-2">Reference Image</p>
          </div>
          
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden relative">
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
            <p className="text-center mt-2">
              {showVideo ? "AR Content" : "Camera Feed"}
            </p>
          </div>
        </div>

        <button
          onClick={isStreaming ? stopCamera : startCamera}
          className={`w-full py-2 px-4 rounded-lg text-white font-semibold mb-4 ${
            isStreaming ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          disabled={showVideo}
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>

        {matchScore !== null && !showVideo && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">
              Match Score: {matchScore.toFixed(1)}%
            </h3>
            <p className="text-gray-600">
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