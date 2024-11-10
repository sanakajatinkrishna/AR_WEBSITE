import React, { useState, useRef, useEffect } from 'react';
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

// Load OpenCV
const loadOpenCV = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.7.0/opencv.js';
    script.async = true;
    script.onload = () => {
      if (window.cv && window.cv.Mat) {
        resolve(window.cv);
      }
    };
    document.body.appendChild(script);
  });
};

const ImageTrackingARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [imageDetected, setImageDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [cvReady, setCvReady] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const detectorRef = useRef(null);

  // Initialize OpenCV
  useEffect(() => {
    const initOpenCV = async () => {
      try {
        const cv = await loadOpenCV();
        detectorRef.current = {
          cv,
          detector: new cv.ORB(),
          matcher: new cv.BFMatcher(cv.NORM_HAMMING, true)
        };
        setCvReady(true);
      } catch (err) {
        setError('Failed to initialize image detection');
      }
    };
    initOpenCV();
  }, []);

  // Start camera
  const startCamera = async () => {
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
        setCameraActive(true);
        startImageTracking();
      }
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  // Process frames and detect image
  const processFrame = (cv, videoElement, canvasElement, referenceImg) => {
    const context = canvasElement.getContext('2d');
    
    // Set canvas size to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Draw current frame
    context.drawImage(videoElement, 0, 0);
    
    // Get current frame
    const frame = cv.imread(canvasElement);
    const frameGray = new cv.Mat();
    cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
    
    // Process reference image
    const refImg = cv.imread(referenceImg);
    const refGray = new cv.Mat();
    cv.cvtColor(refImg, refGray, cv.COLOR_RGBA2GRAY);
    
    // Detect features
    const kp1 = new cv.KeyPointVector();
    const kp2 = new cv.KeyPointVector();
    const desc1 = new cv.Mat();
    const desc2 = new cv.Mat();
    
    detectorRef.current.detector.detect(frameGray, kp1);
    detectorRef.current.detector.detect(refGray, kp2);
    detectorRef.current.detector.compute(frameGray, kp1, desc1);
    detectorRef.current.detector.compute(refGray, kp2, desc2);
    
    // Match features
    const matches = detectorRef.current.matcher.match(desc1, desc2);
    
    // Filter good matches
    const goodMatches = matches.filter(m => m.distance < 50);
    
    if (goodMatches.length > 15) {
      // Get matched keypoints
      const srcPoints = goodMatches.map(m => kp1.get(m.queryIdx).pt);
      const dstPoints = goodMatches.map(m => kp2.get(m.trainIdx).pt);
      
      // Find homography
      const srcPointsMat = cv.matFromArray(srcPoints.length, 1, cv.CV_32FC2, 
        srcPoints.flatMap(p => [p.x, p.y]));
      const dstPointsMat = cv.matFromArray(dstPoints.length, 1, cv.CV_32FC2,
        dstPoints.flatMap(p => [p.x, p.y]));
        
      const homography = cv.findHomography(srcPointsMat, dstPointsMat, cv.RANSAC, 5.0);
      
      // Draw video overlay
      if (homography && overlayVideoRef.current) {
        setImageDetected(true);
        context.save();
        
        // Apply perspective transform
        const matrix = homography.data64F;
        context.transform(
          matrix[0], matrix[3], matrix[1],
          matrix[4], matrix[2], matrix[5]
        );
        
        // Draw video over detected image
        context.drawImage(
          overlayVideoRef.current,
          0, 0,
          refImg.cols,
          refImg.rows
        );
        
        context.restore();
        
        // Start video if not playing
        if (overlayVideoRef.current.paused) {
          overlayVideoRef.current.play();
        }
      } else {
        setImageDetected(false);
        if (overlayVideoRef.current && !overlayVideoRef.current.paused) {
          overlayVideoRef.current.pause();
        }
      }
      
      // Clean up matrices
      homography.delete();
      srcPointsMat.delete();
      dstPointsMat.delete();
    } else {
      setImageDetected(false);
      if (overlayVideoRef.current && !overlayVideoRef.current.paused) {
        overlayVideoRef.current.pause();
      }
    }
    
    // Clean up
    frame.delete();
    frameGray.delete();
    refImg.delete();
    refGray.delete();
    desc1.delete();
    desc2.delete();
    kp1.delete();
    kp2.delete();
    
    // Continue tracking
    animationFrameRef.current = requestAnimationFrame(() => 
      processFrame(cv, videoElement, canvasElement, referenceImg)
    );
  };

  // Start image tracking
  const startImageTracking = () => {
    if (!videoRef.current || !canvasRef.current || !referenceImage || !detectorRef.current) return;
    
    processFrame(
      detectorRef.current.cv,
      videoRef.current,
      canvasRef.current,
      referenceImage
    );
  };

  // Load reference image and video
  useEffect(() => {
    const fetchContent = async () => {
      try {
        const q = query(collection(db, 'arContent'), orderBy('timestamp', 'desc'), limit(1));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            // Load reference image
            const imageUrl = await getDownloadURL(ref(storage, data.fileName.image));
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => setReferenceImage(img);
            img.src = imageUrl;
            
            // Load video
            const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = videoUrl;
              overlayVideoRef.current.onloadeddata = () => setVideoLoaded(true);
            }
            
            setLoading(false);
          }
        });
        
        return unsubscribe;
      } catch (err) {
        setError('Failed to load content');
        setLoading(false);
      }
    };
    
    fetchContent();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (detectorRef.current?.detector) {
        detectorRef.current.detector.delete();
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Camera view canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover"
      />
      
      {/* Hidden elements */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />
      <video
        ref={overlayVideoRef}
        className="hidden"
        playsInline
        loop
      />
      
      {/* Target guide */}
      {cameraActive && !imageDetected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-96 border-2 border-dashed border-white rounded-lg">
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                Show reference image here
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white text-xl">Loading...</div>
        </div>
      )}
      
      {/* Start button */}
      {!cameraActive && !loading && cvReady && videoLoaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            onClick={startCamera}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg text-lg hover:bg-blue-600"
          >
            Start Camera
          </button>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center">
          <div className="bg-red-500 text-white px-4 py-2 rounded">
            {error}
          </div>
        </div>
      )}
      
      {/* Status message */}
      {cameraActive && !imageDetected && (
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center">
          <div className="bg-yellow-500 text-white px-4 py-2 rounded">
            Show your image in the target area
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageTrackingARViewer;