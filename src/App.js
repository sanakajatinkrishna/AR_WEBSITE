import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import './App.css';

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

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [showMessage, setShowMessage] = useState(true);
  const [currentContent, setCurrentContent] = useState(null);
  const [isMarkerFound, setIsMarkerFound] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const loadARScripts = async () => {
      try {
        // Load ARJS first
        const arjsScript = document.createElement('script');
        arjsScript.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js';
        arjsScript.async = true;
        
        // Load AFrame
        const aframeScript = document.createElement('script');
        aframeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/aframe/1.4.2/aframe.min.js';
        aframeScript.async = true;

        // Load Mind-AR
        const mindarScript = document.createElement('script');
        mindarScript.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-aframe.prod.js';
        mindarScript.async = true;

        // Append scripts in order
        document.body.appendChild(aframeScript);
        
        await new Promise((resolve) => {
          aframeScript.onload = resolve;
        });
        
        document.body.appendChild(arjsScript);
        
        await new Promise((resolve) => {
          arjsScript.onload = resolve;
        });
        
        document.body.appendChild(mindarScript);
        
        await new Promise((resolve) => {
          mindarScript.onload = () => {
            initializeAR();
            setIsLoading(false);
            resolve();
          };
        });
      } catch (err) {
        setError('Failed to load AR components: ' + err.message);
        setIsLoading(false);
      }
    };

    loadARScripts();

    // Cleanup
    return () => {
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        if (script.src.includes('aframe') || script.src.includes('ar.js') || script.src.includes('mind-ar')) {
          document.body.removeChild(script);
        }
      });
    };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'arContent'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          console.log('New content received:', data);
          setCurrentContent({
            id: change.doc.id,
            ...data
          });
          
          // Pre-load the image for pattern creation
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = data.imageUrl;
          img.onload = () => {
            console.log('Target image loaded successfully');
          };
          img.onerror = (err) => {
            console.error('Error loading target image:', err);
            setError('Failed to load target image');
          };
        }
      });
    }, (error) => {
      console.error('Firebase error:', error);
      setError('Failed to fetch content: ' + error.message);
    });

    return () => unsubscribe();
  }, []);

  const initializeAR = () => {
    if (typeof window.AFRAME !== 'undefined') {
      window.AFRAME.registerComponent('ar-video', {
        init: function() {
          const marker = this.el.parentNode;
          const video = this.el.getAttribute('material').src;

          marker.addEventListener('markerFound', () => {
            console.log('Marker found!');
            setIsMarkerFound(true);
            setShowMessage(false);
            if (video && video.play) {
              video.play();
            }
          });

          marker.addEventListener('markerLost', () => {
            console.log('Marker lost!');
            setIsMarkerFound(false);
            setShowMessage(true);
            if (video && video.pause) {
              video.pause();
            }
          });
        }
      });
    }
  };

  if (error) {
    return (
      <div className="error-screen">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (isLoading || !currentContent) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading AR Experience...</p>
      </div>
    );
  }

  return (
    <div className="ar-container">
      {showMessage && (
        <div className="overlay-message">
          <p>Point your camera at the image marker</p>
          {isMarkerFound ? 
            <span className="status success">Target Found ✓</span> : 
            <span className="status scanning">Scanning...</span>
          }
        </div>
      )}

      <a-scene
        ref={sceneRef}
        embedded
        arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: true; patternRatio: 0.75; detectionMode: mono_and_matrix;"
        vr-mode-ui="enabled: false"
        renderer="logarithmicDepthBuffer: true; precision: medium;"
        inspector="url: https://cdn.jsdelivr.net/gh/aframevr/aframe-inspector@master/dist/aframe-inspector.min.js"
      >
        <a-assets timeout="30000">
          <video
            ref={videoRef}
            id="ar-video"
            src={currentContent.videoUrl}
            preload="auto"
            loop
            crossOrigin="anonymous"
            playsInline
            webkit-playsinline
          ></video>
        </a-assets>

        <a-marker
          preset="pattern"
          type="pattern"
          url={currentContent.imageUrl}
          smooth="true"
          smoothCount="5"
          smoothTolerance="0.01"
          smoothThreshold="2"
          raycaster="objects: .clickable"
          emitevents="true"
          cursor="fuse: false; rayOrigin: mouse;"
        >
          <a-video
            src="#ar-video"
            position="0 0 0"
            rotation="-90 0 0"
            width="2"
            height="1.5"
            ar-video
          ></a-video>
        </a-marker>

        <a-entity camera></a-entity>
      </a-scene>

      <div className="debug-info">
        <p>Camera Status: {navigator.mediaDevices ? "Supported" : "Not Supported"}</p>
        <p>Marker Status: {isMarkerFound ? "Found" : "Not Found"}</p>
        <p>Video URL: {currentContent.videoUrl ? "Loaded" : "Not Loaded"}</p>
      </div>
    </div>
  );
}

export default App;