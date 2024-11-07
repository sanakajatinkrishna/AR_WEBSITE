// components/ARViewer.js
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Firebase configuration - Replace with your config
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

function ARViewer() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const initAR = async () => {
      try {
        // Load AR scripts
        await Promise.all([
          loadScript('https://aframe.io/releases/1.2.0/aframe.min.js'),
          loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js')
        ]);

        // Setup AR scene after scripts are loaded
        setupARScene();
      } catch (err) {
        console.error('AR initialization error:', err);
        setError('Failed to load AR experience. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) {
        scene.parentNode.removeChild(scene);
      }
    };
  }, []);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  };

  const setupARScene = () => {
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'logarithmicDepthBuffer: true; precision: medium;');

    // Create marker detector
    const marker = document.createElement('a-marker');
    marker.setAttribute('type', 'pattern');
    marker.setAttribute('preset', 'custom');
    marker.setAttribute('url', ''); // Will be set when marker is detected

    // Handle marker detection
    marker.addEventListener('markerFound', async () => {
      setScanning(false);
      const pattern = marker.getAttribute('pattern');
      
      try {
        // Query Firestore for the experience with this pattern
        const experiencesRef = collection(db, 'arExperiences');
        const q = query(experiencesRef, where('markerUrl', '==', pattern));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const experienceData = querySnapshot.docs[0].data();
          setupVideo(experienceData.videoUrl, marker);
        }
      } catch (error) {
        console.error('Error fetching experience:', error);
        setError('Failed to load AR content');
      }
    });

    marker.addEventListener('markerLost', () => {
      setScanning(true);
    });

    const camera = document.createElement('a-entity');
    camera.setAttribute('camera', '');
    
    scene.appendChild(marker);
    scene.appendChild(camera);
    document.body.appendChild(scene);
  };

  const setupVideo = (videoUrl, marker) => {
    // Create video element if it doesn't exist
    let video = document.querySelector('#ar-video');
    if (!video) {
      const assets = document.createElement('a-assets');
      video = document.createElement('video');
      video.id = 'ar-video';
      video.setAttribute('preload', 'auto');
      video.setAttribute('response-type', 'arraybuffer');
      video.setAttribute('crossorigin', 'anonymous');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('loop', 'true');
      video.src = videoUrl;
      assets.appendChild(video);
      marker.parentNode.appendChild(assets);

      const videoEntity = document.createElement('a-video');
      videoEntity.setAttribute('src', '#ar-video');
      videoEntity.setAttribute('position', '0 0 0');
      videoEntity.setAttribute('rotation', '-90 0 0');
      videoEntity.setAttribute('width', '2');
      videoEntity.setAttribute('height', '1.5');
      marker.appendChild(videoEntity);
    }

    video.play().catch(console.error);
  };

  if (loading) {
    return <LoadingScreen>Loading AR Experience...</LoadingScreen>;
  }

  if (error) {
    return (
      <ErrorContainer>
        <ErrorText>{error}</ErrorText>
        <RetryButton onClick={() => window.location.reload()}>Try Again</RetryButton>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      {scanning && (
        <Instructions>
          Point your camera at the marker image to view AR content
        </Instructions>
      )}
    </Container>
  );
}


// Styled Components
const Container = styled.div`
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background-color: #000;
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 25px;
  font-size: 16px;
  text-align: center;
  z-index: 100;
  width: 80%;
  max-width: 400px;
`;

const LoadingScreen = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  text-align: center;
  padding: 20px;
`;

const LoadingText = styled.div`
  font-size: 18px;
  margin: 10px;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  color: white;
  max-width: 80%;
  width: 300px;
`;

const ErrorText = styled.div`
  font-size: 16px;
  margin-bottom: 20px;
`;

const RetryButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;

  &:hover {
    background: #1976D2;
  }
`;

export default ARViewer;