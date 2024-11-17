import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

function App() {
  const [targetImages, setTargetImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matching, setMatching] = useState({});
  const [matchResults, setMatchResults] = useState({});
  const [uploadedImages, setUploadedImages] = useState({});

  useEffect(() => {
    fetchTargetImagesFromFirebase();
  }, []);

  const fetchTargetImagesFromFirebase = async () => {
    try {
      const imagesQuery = query(collection(db, 'arContent'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(imagesQuery);
      
      const imageData = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          imageUrl: data.imageUrl,
          contentKey: data.contentKey,
          timestamp: data.timestamp?.toDate() || new Date(),
          videoUrl: data.videoUrl,
          matchScore: null
        };
      }));

      setTargetImages(imageData);
    } catch (err) {
      setError('Failed to fetch target images from Firebase');
      console.error('Firebase fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const compareImages = async (targetUrl, uploadedUrl) => {
    return new Promise((resolve, reject) => {
      const targetImg = new Image();
      const uploadedImg = new Image();
      let loadedImages = 0;

      const onBothLoaded = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set consistent size for comparison
        canvas.width = 224;
        canvas.height = 224;

        // Draw and compare target image
        ctx.drawImage(targetImg, 0, 0, 224, 224);
        const targetData = ctx.getImageData(0, 0, 224, 224).data;

        // Draw and compare uploaded image
        ctx.drawImage(uploadedImg, 0, 0, 224, 224);
        const uploadedData = ctx.getImageData(0, 0, 224, 224).data;

        // Calculate pixel similarity
        let matchCount = 0;
        const totalPixels = targetData.length / 4;
        const threshold = 30; // RGB difference threshold

        for (let i = 0; i < targetData.length; i += 4) {
          const targetRGB = [targetData[i], targetData[i + 1], targetData[i + 2]];
          const uploadedRGB = [uploadedData[i], uploadedData[i + 1], uploadedData[i + 2]];
          
          const difference = Math.sqrt(
            Math.pow(targetRGB[0] - uploadedRGB[0], 2) +
            Math.pow(targetRGB[1] - uploadedRGB[1], 2) +
            Math.pow(targetRGB[2] - uploadedRGB[2], 2)
          );

          if (difference < threshold) {
            matchCount++;
          }
        }

        const matchScore = (matchCount / totalPixels) * 100;
        resolve(matchScore);
      };

      targetImg.onload = () => {
        loadedImages++;
        if (loadedImages === 2) onBothLoaded();
      };
      uploadedImg.onload = () => {
        loadedImages++;
        if (loadedImages === 2) onBothLoaded();
      };
      targetImg.onerror = reject;
      uploadedImg.onerror = reject;

      targetImg.src = targetUrl;
      uploadedImg.src = uploadedUrl;
    });
  };

  const uploadAndMatchImage = async (targetImageId) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setMatching(prev => ({ ...prev, [targetImageId]: true }));
        
        try {
          // Upload to Firebase Storage
          const storageRef = ref(storage, `uploaded-images/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          const uploadedUrl = await getDownloadURL(storageRef);

          // Create URL for preview
          const previewUrl = URL.createObjectURL(file);
          setUploadedImages(prev => ({
            ...prev,
            [targetImageId]: previewUrl
          }));

          // Perform matching
          const targetImage = targetImages.find(img => img.id === targetImageId);
          const matchScore = await compareImages(targetImage.imageUrl, uploadedUrl);
          
          setMatchResults(prev => ({
            ...prev,
            [targetImageId]: {
              score: matchScore.toFixed(2),
              timestamp: new Date().toISOString(),
              matched: matchScore > 75,
              uploadedUrl
            }
          }));

        } catch (err) {
          setError(`Failed to match image: ${err.message}`);
          console.error('Upload and match error:', err);
        } finally {
          setMatching(prev => ({ ...prev, [targetImageId]: false }));
        }
      };

      input.click();
    } catch (err) {
      setError('Failed to initiate image upload');
      setMatching(prev => ({ ...prev, [targetImageId]: false }));
    }
  };

  const getMatchFeedback = (score) => {
    if (score > 90) return { text: 'Excellent Match', class: 'bg-green-100 text-green-800' };
    if (score > 75) return { text: 'Good Match', class: 'bg-blue-100 text-blue-800' };
    if (score > 50) return { text: 'Partial Match', class: 'bg-yellow-100 text-yellow-800' };
    return { text: 'Poor Match', class: 'bg-red-100 text-red-800' };
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center text-gray-800">
            AR Image Matcher
          </h1>
          <p className="text-center text-gray-600 mt-2">
            Compare your images with AR targets
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6" role="alert">
            <div className="flex items-center">
              <span className="text-red-700" aria-hidden="true">⚠️</span>
              <p className="text-red-700 ml-2">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin text-blue-500 text-2xl" aria-label="Loading">↻</div>
          </div>
        ) : (
          <div className="space-y-8">
            {targetImages.map((image) => (
              <div key={image.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">
                    Target: {image.contentKey}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Target Image */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-500">Target Image:</h4>
                      <div className="relative pt-[75%] bg-gray-50 rounded-lg overflow-hidden">
                        <img
                          src={image.imageUrl}
                          alt={`Target ${image.contentKey}`}
                          className="absolute top-0 left-0 w-full h-full object-cover"
                        />
                      </div>
                    </div>

                    {/* Uploaded Image */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-500">Your Upload:</h4>
                      <div className="relative pt-[75%] bg-gray-50 rounded-lg overflow-hidden">
                        {uploadedImages[image.id] ? (
                          <img
                            src={uploadedImages[image.id]}
                            alt={`Uploaded for comparison with ${image.contentKey}`}
                            className="absolute top-0 left-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-gray-400">
                            Upload an image to compare
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Match Results */}
                  {matchResults[image.id] && (
                    <div className="mt-4">
                      <div className={`rounded-md px-3 py-2 mb-2 ${getMatchFeedback(matchResults[image.id].score).class}`}>
                        <p className="text-sm font-medium">
                          {getMatchFeedback(matchResults[image.id].score).text}
                        </p>
                        <p className="text-xs">
                          Match Score: {matchResults[image.id].score}%
                        </p>
                      </div>
                      {matchResults[image.id].matched && (
                        <div className="text-sm text-green-600">
                          ✓ AR content will trigger for this image
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload Button */}
                  <button
                    onClick={() => uploadAndMatchImage(image.id)}
                    disabled={matching[image.id]}
                    className={`mt-4 w-full px-4 py-2 rounded-md text-sm font-medium ${
                      matching[image.id]
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {matching[image.id] ? (
                      <span>Matching...</span>
                    ) : (
                      <span>{uploadedImages[image.id] ? 'Try Another Image' : 'Upload Image to Match'}</span>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;