import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

// Firebase Configuration remains the same
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

// OpenCV initialization remains the same
const loadOpenCV = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.7.0/opencv.js';
    script.async = true;
    script.onload = () => {
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

const MarkerGuide = ({ size, color = "#ffffff", visible }) => {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
      <div 
        style={{ 
          width: `${size}px`, 
          height: `${size}px`,
          border: `2px dashed ${color}`,
          borderRadius: '8px'
        }}
        className="relative"
      >
        {/* Corner markers */}
        <div className="absolute -left-2 -top-2 w-4 h-4 border-l-2 border-t-2" style={{ borderColor: color }} />
        <div className="absolute -right-2 -top-2 w-4 h-4 border-r-2 border-t-2" style={{ borderColor: color }} />
        <div className="absolute -left-2 -bottom-2 w-4 h-4 border-l-2 border-b-2" style={{ borderColor: color }} />
        <div className="absolute -right-2 -bottom-2 w-4 h-4 border-r-2 border-b-2" style={{ borderColor: color }} />
        
        {/* Guide text */}
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 text-white text-sm whitespace-nowrap">
          Show your image here
        </div>
      </div>
    </div>
  );
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
  const [muted, setMuted] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const detectorRef = useRef(null);
  const cvRef = useRef(null);

  // Guide frame size
  const GUIDE_SIZE = 300;

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

  // Initialize camera with higher resolution
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
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

  // Initialize feature detector
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

  // Track image with improved feature matching
  const trackImage = (currentFrame, referenceImg) => {
    if (!detectorRef.current || !cvRef.current) return null;

    const cv = cvRef.current;
    
    // Convert images to grayscale
    const gray = new cv.Mat();
    const refGray = new cv.Mat();
    cv.cvtColor(currentFrame, gray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(referenceImg, refGray, cv.COLOR_RGBA2GRAY);

    // Detect keypoints and compute descriptors
    const keypoints1 = new cv.KeyPointVector();
    const keypoints2 = new cv.KeyPointVector();
    const descriptors1 = new cv.Mat();
    const descriptors2 = new cv.Mat();

    detectorRef.current.detectAndCompute(gray, new cv.Mat(), keypoints1, descriptors1);
    detectorRef.current.detectAndCompute(refGray, new cv.Mat(), keypoints2, descriptors2);

    // Match features using FLANN matcher for better performance
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = matcher.match(descriptors1, descriptors2);

    // Filter good matches based on distance
    const good_matches = matches.filter(match => match.distance < 50);

    if (good_matches.length > 15) {
      const srcPoints = good_matches.map(match => keypoints1.get(match.queryIdx).pt);
      const dstPoints = good_matches.map(match => keypoints2.get(match.trainIdx).pt);

      // Find homography matrix
      const srcPointsMat = cv.matFromArray(srcPoints.length, 1, cv.CV_32FC2, 
        srcPoints.flatMap(pt => [pt.x, pt.y]));
      const dstPointsMat = cv.matFromArray(dstPoints.length, 1, cv.CV_32FC2,
        dstPoints.flatMap(pt => [pt.x, pt.y]));
      
      const homography = cv.findHomography(srcPointsMat, dstPointsMat, cv.RANSAC, 5.0);

      // Cleanup
      gray.delete(); refGray.delete();
      descriptors1.delete(); descriptors2.delete();
      srcPointsMat.delete(); dstPointsMat.delete();

      return homography;
    }

    // Cleanup
    gray.delete(); refGray.delete();
    descriptors1.delete(); descriptors2.delete();

    return null;
  };

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
        setShowGuide(false);

        // Clear display canvas
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

        // Draw camera feed
        displayCtx.drawImage(videoRef.current, 0, 0, displayCanvas.width, displayCanvas.height);

        // Apply perspective transform and draw video
        displayCtx.save();
        const matrix = homography.data64F;
        displayCtx.transform(
          matrix[0], matrix[3], matrix[1],
          matrix[4], matrix[2], matrix[5]
        );

        if (overlayVideoRef.current.paused) {
          overlayVideoRef.current.play();
          // Unmute after first interaction
          if (muted) {
            setMuted(false);
            overlayVideoRef.current.muted = false;
          }
        }

        displayCtx.drawImage(
          overlayVideoRef.current,
          0, 0,
          referenceImage.width,
          referenceImage.height
        );

        displayCtx.restore();
      } else {
        setImageDetected(false);
        setShowGuide(true);
        if (!overlayVideoRef.current.paused) {
          overlayVideoRef.current.pause();
        }
        // Draw only camera feed when no image is detected
        displayCtx.drawImage(videoRef.current, 0, 0, displayCanvas.width, displayCanvas.height);
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

  // Fetch content from Firebase
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
            setVideoUrl(videoUrl);

            const imageUrl = await getDownloadURL(ref(storage, data.fileName.image));
            
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
      {/* Camera Feed and AR Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full"
      />

      {/* Hidden Elements */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />
      <canvas
        ref={processingCanvasRef}
        className="hidden"
      />
      <video
        ref={overlayVideoRef}
        className="hidden"
        playsInline
        loop
        muted={muted}
      />

      {/* Marker Guide */}
      <MarkerGuide 
        size={GUIDE_SIZE} 
        color={imageDetected ? "#00ff00" : "#ffffff"}
        visible={showGuide && cameraActive}
      />

      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg bg-white p-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-4">
        {!cameraActive && (<button
            onClick={startCamera}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-400"
            disabled={!canStart}
          >
            {loading ? 'Loading Content...' : 'Start Camera'}
          </button>
        )}
        {cameraActive && (
          <button
            onClick={() => {
              if (overlayVideoRef.current) {
                setMuted(!muted);
                overlayVideoRef.current.muted = !muted;
              }
            }}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            {muted ? 'Unmute Sound' : 'Mute Sound'}
          </button>
        )}
      </div>

      {/* Status Messages */}
      <div className="absolute top-4 left-0 right-0 z-30 flex justify-center">
        {cameraActive && !imageDetected && (
          <div className="rounded-lg bg-yellow-500 px-4 py-2 text-white">
            Show your reference image to the camera
          </div>
        )}
        {imageDetected && (
          <div className="rounded-lg bg-green-500 px-4 py-2 text-white">
            Image Detected - Playing AR Video
          </div>
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

      {/* Instructions Modal - Shows when first launching */}
      {!cameraActive && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black bg-opacity-75">
          <div className="mx-4 rounded-lg bg-white p-6 max-w-md">
            <h2 className="mb-4 text-xl font-bold">How to Use AR Viewer</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>Click "Start Camera" to begin</li>
              <li>Allow camera access when prompted</li>
              <li>Show your reference image to the camera</li>
              <li>Hold the image steady when detected</li>
              <li>The AR video will play over your image</li>
              <li>Use the sound button to toggle audio</li>
            </ol>
            <p className="mt-4 text-sm text-gray-600">
              For best results, ensure good lighting and hold the image steady
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageTrackingARViewer;