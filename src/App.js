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

// OpenCV initialization
const loadOpenCV = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.7.0/opencv.js';
    script.async = true;
    script.onload = () => {
      // Wait for OpenCV to be fully loaded
      const checkInterval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(checkInterval);
          resolve(window.cv);
        }
      }, 100);
    };
    document.body.appendChild(script);
  });
};

const ImageTrackingARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const processingCanvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [imageDetected, setImageDetected] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [openCVLoaded, setOpenCVLoaded] = useState(false);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const detectorRef = useRef(null);
  const cvRef = useRef(null);

  // Initialize OpenCV
  useEffect(() => {
    const initOpenCV = async () => {
      try {
        const cv = await loadOpenCV();
        cvRef.current = cv;
        setOpenCVLoaded(true);
      } catch (err) {
        setError('Failed to load OpenCV');
      }
    };

    initOpenCV();
  }, []);

  // Initialize AKAZE feature detector
  const initializeDetector = async () => {
    try {
      if (cvRef.current) {
        detectorRef.current = new cvRef.current.AKAZE();
      } else {
        throw new Error('OpenCV not loaded');
      }
    } catch (err) {
      setError('Failed to initialize image detector: ' + err.message);
    }
  };

  // Initialize camera
  const startCamera = async () => {
    if (!openCVLoaded) {
      setError('OpenCV is not yet loaded');
      return;
    }

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
        await initializeDetector();
        initializeTracking();
      }
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  // Track image implementation
  const trackImage = (currentFrame, referenceImg) => {
    if (!detectorRef.current || !cvRef.current) return null;

    const cv = cvRef.current;
    
    // Convert current frame to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(currentFrame, gray, cv.COLOR_RGBA2GRAY);

    // Detect keypoints and compute descriptors
    const keypoints1 = new cv.KeyPointVector();
    const descriptors1 = new cv.Mat();
    detectorRef.current.detectAndCompute(gray, new cv.Mat(), keypoints1, descriptors1);

    // Get reference image keypoints and descriptors
    const refGray = new cv.Mat();
    cv.cvtColor(referenceImg, refGray, cv.COLOR_RGBA2GRAY);
    const keypoints2 = new cv.KeyPointVector();
    const descriptors2 = new cv.Mat();
    detectorRef.current.detectAndCompute(refGray, new cv.Mat(), keypoints2, descriptors2);

    // Match features
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = matcher.match(descriptors1, descriptors2);

    // Filter good matches
    const good_matches = matches.filter(match => match.distance < 50);

    if (good_matches.length > 15) {
      // Get matched keypoints
      const srcPoints = good_matches.map(match => 
        keypoints1.get(match.queryIdx).pt);
      const dstPoints = good_matches.map(match => 
        keypoints2.get(match.trainIdx).pt);

      // Find homography
      const srcPointsMat = cv.matFromArray(srcPoints.length, 1, cv.CV_32FC2, 
        srcPoints.flatMap(pt => [pt.x, pt.y]));
      const dstPointsMat = cv.matFromArray(dstPoints.length, 1, cv.CV_32FC2,
        dstPoints.flatMap(pt => [pt.x, pt.y]));
      
      const homography = cv.findHomography(srcPointsMat, dstPointsMat, cv.RANSAC);

      // Clean up
      gray.delete();
      refGray.delete();
      descriptors1.delete();
      descriptors2.delete();
      srcPointsMat.delete();
      dstPointsMat.delete();

      return homography;
    }

    // Clean up
    gray.delete();
    refGray.delete();
    descriptors1.delete();
    descriptors2.delete();

    return null;
  };

  // Initialize tracking
  const initializeTracking = () => {
    const processFrame = () => {
      if (!videoRef.current || !canvasRef.current || !processingCanvasRef.current || 
          !videoLoaded || !referenceImage || !cvRef.current) return;

      const cv = cvRef.current;
      const procCanvas = processingCanvasRef.current;
      const procCtx = procCanvas.getContext('2d');
      const displayCanvas = canvasRef.current;
      const displayCtx = displayCanvas.getContext('2d');

      // Set canvas sizes
      procCanvas.width = videoRef.current.videoWidth;
      procCanvas.height = videoRef.current.videoHeight;
      displayCanvas.width = window.innerWidth;
      displayCanvas.height = window.innerHeight;

      // Draw video frame to processing canvas
      procCtx.drawImage(videoRef.current, 0, 0);
      
      // Get current frame
      const imageData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
      const currentMat = cv.matFromImageData(imageData);

      // Convert reference image to Mat
      const refCanvas = document.createElement('canvas');
      refCanvas.width = referenceImage.width;
      refCanvas.height = referenceImage.height;
      const refCtx = refCanvas.getContext('2d');
      refCtx.drawImage(referenceImage, 0, 0);
      const refImageData = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);
      const refMat = cv.matFromImageData(refImageData);

      // Track image
      const homography = trackImage(currentMat, refMat);

      if (homography && overlayVideoRef.current) {
        setImageDetected(true);

        // Clear display canvas
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

        // Apply perspective transform and draw video
        displayCtx.save();
        const matrix = homography.data64F;
        displayCtx.transform(
          matrix[0], matrix[3], matrix[1],
          matrix[4], matrix[2], matrix[5]
        );

        if (!overlayVideoRef.current.paused) {
          displayCtx.drawImage(
            overlayVideoRef.current,
            0, 0,
            referenceImage.width,
            referenceImage.height
          );
        }

        displayCtx.restore();
      } else {
        setImageDetected(false);
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      }

      // Clean up
      currentMat.delete();
      refMat.delete();
      if (homography) homography.delete();

      // Continue tracking
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);
  };

  // Fetch video and reference image from Firebase
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
            // Get video URL
            const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
            setVideoUrl(videoUrl);

            // Get reference image URL
            const imageUrl = await getDownloadURL(ref(storage, data.fileName.image));
            
            // Load reference image
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              setReferenceImage(img);
              setLoading(false);
            };
            img.src = imageUrl;

            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = videoUrl;
              overlayVideoRef.current.load();
            }
          } catch (error) {
            setError('Failed to load AR content');
          }
        }
      });
    };

    const unsubscribe = fetchARContent();
    return () => unsubscribe();
  }, []);

  // Handle video loading
  useEffect(() => {
    if (overlayVideoRef.current && videoUrl) {
      overlayVideoRef.current.onloadeddata = () => {
        setVideoLoaded(true);
      };
      overlayVideoRef.current.onerror = () => {
        setError('Failed to load video');
        setVideoLoaded(false);
      };
    }
  }, [videoUrl]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (detectorRef.current) {
        detectorRef.current.delete();
      }
    };
  }, []);

  const canStart = !loading && videoUrl && !cameraActive && referenceImage && openCVLoaded;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg bg-white p-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        </div>
      )}

      {/* Reference Image Guide */}
      {!imageDetected && cameraActive && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="rounded-lg border-2 border-dashed border-white p-4">
            <div className="text-white text-center">
              Point camera at the reference image
            </div>
          </div>
        </div>
      )}

      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Processing Canvas (hidden) */}
      <canvas
        ref={processingCanvasRef}
        className="hidden"
      />

      {/* Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full"
      />

      {/* Hidden Video Element */}
      <video
        ref={overlayVideoRef}
        className="hidden"
        playsInline
        loop
        muted
        autoPlay
      />

      {/* Controls */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center">
        {!cameraActive && (
          <button
            onClick={startCamera}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-400"
            disabled={!canStart}
          >
            {loading ? 'Loading Content...' : 'Start Camera'}
          </button>
        )}
      </div>

      {/* Error Messages */}
      {error && (
        <div className="absolute inset-x-0 top-4 z-30 text-center">
          <div className="inline-block rounded-lg bg-red-500 px-4 py-2 text-white">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageTrackingARViewer;