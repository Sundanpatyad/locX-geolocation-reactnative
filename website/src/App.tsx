import {Navigate, Route, Routes} from 'react-router-dom';
import {Docs} from './pages/Docs';
import {Home} from './pages/Home';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/docs/:section" element={<Docs />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
