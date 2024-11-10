import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import './App.css';

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

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [currentContent, setCurrentContent] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    // Request camera permission first
    const requestCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasPermission(true);
        // Stop the stream as AR.js will handle it
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('Camera permission error:', err);
        setErrorMessage('Please allow camera access to use AR features');
        setHasPermission(false);
      }
    };

    requestCameraPermission();
  }, []);

  useEffect(() => {
    // Only load AR scripts after camera permission is granted
    if (hasPermission) {
      const loadARScripts = async () => {
        try {
          // Load Aframe first
          const aframe = document.createElement('script');
          aframe.src = 'https://aframe.io/releases/1.4.0/aframe.min.js';
          document.head.appendChild(aframe);

          await new Promise((resolve) => {
            aframe.onload = resolve;
          });

          // Then load AR.js
          const arjs = document.createElement('script');
          arjs.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js';
          document.head.appendChild(arjs);

          arjs.onload = () => {
            setIsLoading(false);
            console.log('AR.js loaded successfully');
          };
        } catch (error) {
          console.error('Error loading AR scripts:', error);
          setErrorMessage('Failed to load AR components');
        }
      };

      loadARScripts();
    }
  }, [hasPermission]);

  useEffect(() => {
    // Listen for Firebase updates
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
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Show loading screen
  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Starting AR Camera...</p>
      </div>
    );
  }

  // Show error message
  if (errorMessage) {
    return (
      <div className="error-screen">
        <h2>Error</h2>
        <p>{errorMessage}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  // Show AR scene
  return (
    <>
      <div className="ar-overlay">
        <div className="status-message">
          Point camera at the image
        </div>
      </div>

      <a-scene
        embedded
        arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;"
        renderer="logarithmicDepthBuffer: true;"
        vr-mode-ui="enabled: false"
      >
        {currentContent && (
          <>
            <a-assets>
              <video
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
              raycaster="objects: .clickable"
              emitevents="true"
              cursor="fuse: false; rayOrigin: mouse;"
            >
              <a-video
                src="#ar-video"
                position="0 0.1 0"
                rotation="-90 0 0"
                width="2"
                height="1.5"
              ></a-video>
            </a-marker>
          </>
        )}

        <a-entity camera></a-entity>
      </a-scene>
    </>
  );
}

export default App;