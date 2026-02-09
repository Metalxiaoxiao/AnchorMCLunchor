import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import { AnimatedPopup } from './AnimatedPopup';
import { ModDetailModal } from './ModDetailModal';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
`;

const SearchBar = styled.div`
  display: flex;
  gap: 1rem;
`;

const Input = styled.input`
  flex: 1;
  padding: 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.8);
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const SearchButton = styled.button`
  padding: 0 1rem;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: var(--accent-hover);
  }
  
  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const FilterButton = styled.button`
  padding: 0 1rem;
  background-color: white;
  color: #333;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;

  &:hover {
    background-color: #f8fafc;
  }
`;

const Select = styled.select`
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: white;
  color: #333;
  width: 100%;
`;

const Label = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  margin-bottom: 0.2rem;
  color: #64748b;
`;

const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-left-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingSpinner = styled.div`
  width: 30px;
  height: 30px;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-left-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
  overflow-y: auto;
  padding-right: 0.5rem;
  flex: 1;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
`;

const Card = styled.div`
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const Icon = styled.img`
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  background-color: #ddd;
`;

const Title = styled.div`
  font-weight: bold;
  font-size: 1.1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Author = styled.div`
  font-size: 0.8rem;
  color: #64748b;
`;

const Description = styled.div`
  font-size: 0.9rem;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
`;

const Stats = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #64748b;
  margin-top: auto;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: var(--bg-color);
  padding: 2rem;
  border-radius: 12px;
  width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const VersionList = styled.div`
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
`;

const VersionItem = styled.div`
  padding: 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

interface ProjectHit {
  project_id: string;
  title: string;
  description: string;
  icon_url: string | null;
  author: string;
  follows: number;
  downloads: number;
}

interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: { url: string; filename: string; primary: boolean }[];
}

interface Props {
  type: 'mod' | 'modpack';
  onInstall: (version: ProjectVersion, project: ProjectHit) => void;
  currentVersion?: string;
  gamePath?: string;
  showAlert?: (msg: string) => void;
  onSwitchToGameDownload?: () => void;
}

export const ModrinthBrowser: React.FC<Props> = ({ type, onInstall, currentVersion, gamePath, showAlert, onSwitchToGameDownload }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<ProjectHit[]>([]);
  
  // Pagination
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentSort, setCurrentSort] = useState("downloads");

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [selectedGameVersion, setSelectedGameVersion] = useState(currentVersion || "");
  const [selectedLoader, setSelectedLoader] = useState("");

  useEffect(() => {
    if (currentVersion) {
      setSelectedGameVersion(currentVersion);
    }
  }, [currentVersion]);

  useEffect(() => {
    // Initial load: popular items
    resetSearch("", "downloads");
    loadGameVersions();
  }, [type]);

  useEffect(() => {
    if (type === 'mod') {
      resetSearch(query, currentSort);
    }
  }, [selectedGameVersion, selectedLoader]);

  const loadGameVersions = async () => {
    try {
      const versions = await invoke<string[]>('get_game_versions');
      setGameVersions(versions);
    } catch (e) {
      console.error("Failed to load game versions", e);
    }
  };

  const resetSearch = (q: string, sort: string) => {
    setQuery(q);
    setCurrentSort(sort);
    setOffset(0);
    setHasMore(true);
    setResults([]);
    loadMore(q, sort, 0);
  };

  const loadMore = async (q: string, sort: string, off: number) => {
    setLoading(true);
    try {
      const res = await invoke<{ hits: ProjectHit[] }>('search_modrinth', {
        query: q,
        projectType: type,
        offset: off,
        limit: 20,
        index: sort,
        gameVersion: selectedGameVersion || null,
        loader: selectedLoader || null
      });
      
      setResults(prev => off === 0 ? res.hits : [...prev, ...res.hits]);
      setHasMore(res.hits.length === 20);
      setOffset(off + 20);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (!loading && hasMore) {
        loadMore(query, currentSort, offset);
      }
    }
  };

  const handleSearchClick = () => {
    const sort = query === "" ? "downloads" : "relevance";
    setShowFilters(false);
    resetSearch(query, sort);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  };

  const openProject = (project: ProjectHit) => {
    setSelectedProjects(prev => [...prev, project]);
  };

  const closeProject = () => {
    setSelectedProjects(prev => prev.slice(0, -1));
  };

  return (
    <Container>
      <SearchBar>
        <Input 
          placeholder={`搜索 ${type === 'mod' ? 'Mod' : '整合包'}...`} 
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        
        {type === 'mod' && (
        <FilterButton onClick={() => setShowFilters(!showFilters)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          筛选
          <AnimatedPopup 
            isOpen={showFilters} 
            align="right"
            onClose={() => setShowFilters(false)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <Label>游戏版本</Label>
                <Select 
                  value={selectedGameVersion} 
                  onChange={e => setSelectedGameVersion(e.target.value)}
                >
                  <option value="">全部</option>
                  {gameVersions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>加载器</Label>
                <Select 
                  value={selectedLoader} 
                  onChange={e => setSelectedLoader(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="fabric">Fabric</option>
                  <option value="forge">Forge</option>
                  <option value="quilt">Quilt</option>
                  <option value="neoforge">NeoForge</option>
                </Select>
              </div>
            </div>
          </AnimatedPopup>
        </FilterButton>
        )}

        <SearchButton onClick={handleSearchClick} disabled={loading && offset === 0}>
          {loading && offset === 0 ? <Spinner /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          )}
        </SearchButton>
      </SearchBar>

      <Grid onScroll={handleScroll}>
        {results.map(p => (
          <Card key={p.project_id} onClick={() => openProject(p)}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Icon src={p.icon_url || 'https://via.placeholder.com/64'} />
              <div style={{ overflow: 'hidden' }}>
                <Title>{p.title}</Title>
                <Author>by {p.author}</Author>
              </div>
            </div>
            <Description>{p.description}</Description>
            <Stats>
              <span>⬇ {p.downloads}</span>
              <span>♥ {p.follows}</span>
            </Stats>
          </Card>
        ))}
        {loading && offset > 0 && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: '1rem' }}>
             <LoadingSpinner />
          </div>
        )}
        {loading && offset === 0 && results.length === 0 && (
           <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: '3rem' }}>
             <LoadingSpinner />
           </div>
        )}
        {!loading && results.length === 0 && (
           <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#666' }}>
              未找到相关结果
           </div>
        )}
      </Grid>

      {selectedProjects.map((project, index) => (
        <ModDetailModal 
          key={`${project.project_id}-${index}`}
          project={project} 
          filterGameVersion={selectedGameVersion}
          filterLoader={selectedLoader}
          onClose={closeProject}
          onInstall={(v) => onInstall(v, project)}
          onOpenProject={openProject}
          gamePath={gamePath}
          currentVersion={currentVersion}
          showAlert={showAlert}
          onSwitchToGameDownload={onSwitchToGameDownload}
        />
      ))}
    </Container>
  );
};
