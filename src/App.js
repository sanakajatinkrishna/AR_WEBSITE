import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black">
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Target Rectangle - Centered with red border */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="border-4 border-red-500 rounded-lg"
          style={{
            width: '250px',  // Adjust size as needed
            height: '350px'  // Adjust size as needed
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;