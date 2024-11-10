import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import './App.css'; // You'll need to create this

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
  const [showMessage, setShowMessage] = useState(true);
  const [currentContent, setCurrentContent] = useState(null);

  useEffect(() => {
    // Load AR.js and A-Frame scripts dynamically
    const loadScripts = async () => {
      const aframeScript = document.createElement('script');
      aframeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/aframe/1.4.2/aframe.min.js';
      aframeScript.async = true;

      const arjsScript = document.createElement('script');
      arjsScript.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js';
      arjsScript.async = true;

      document.body.appendChild(aframeScript);
      
      aframeScript.onload = () => {
        document.body.appendChild(arjsScript);
        arjsScript.onload = () => {
          initializeAR();
          setIsLoading(false);
        };
      };

      return () => {
        document.body.removeChild(aframeScript);
        document.body.removeChild(arjsScript);
      };
    };

    loadScripts();
  }, []);

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
          setCurrentContent({
            id: change.doc.id,
            ...data
          });
        }
      });
    });

    return () => unsubscribe();
  }, []);

  const initializeAR = () => {
    // Register custom components
    window.AFRAME.registerComponent('video-handler', {
      init: function() {
        const marker = this.el.parentNode;
        const video = document.querySelector('#ar-video');

        marker.addEventListener('markerFound', () => {
          setShowMessage(false);
          if (video) video.play();
        });

        marker.addEventListener('markerLost', () => {
          setShowMessage(true);
          if (video) video.pause();
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading AR Experience...</p>
      </div>
    );
  }

  return (
    <>
      {showMessage && (
        <div className="overlay-message">
          Point your camera at the image marker
        </div>
      )}

      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <a-scene
          embedded
          arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
          vr-mode-ui="enabled: false"
          loading-screen="enabled: false"
        >
          <a-assets>
            {currentContent && (
              <video
                id="ar-video"
                src={currentContent.videoUrl}
                preload="auto"
                loop
                crossOrigin="anonymous"
              ></video>
            )}
          </a-assets>

          <a-marker
            preset="custom"
            type="pattern"
            url={currentContent?.imageUrl}
            smooth="true"
            smoothCount="10"
          >
            <a-video
              src="#ar-video"
              position="0 0.1 0"
              rotation="-90 0 0"
              width="1.5"
              height="1"
              video-handler
            ></a-video>
          </a-marker>

          <a-entity camera></a-entity>
        </a-scene>
      </div>
    </>
  );
}

export default App;