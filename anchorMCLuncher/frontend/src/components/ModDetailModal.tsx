import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import ReactMarkdown from 'react-markdown';
import { LoadingSpinner } from './LoadingSpinner';
import { ChoiceModal } from './ChoiceModal';

const slideIn = keyframes`
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 40px;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.95);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  animation: ${slideIn} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(20px);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 2rem;
  background: transparent;
  border-bottom: 1px solid rgba(0,0,0,0.05);
`;

const BackButton = styled.button`
  background: rgba(0, 0, 0, 0.05);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  margin-right: 1rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: var(--accent-color);
    color: white;
    transform: scale(1.1);
  }

  svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
`;

const ModalContent = styled.div`
  flex: 1;
  padding: 2rem;
  overflow: hidden;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const ProjectHeader = styled.div`
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
`;

const Icon = styled.img`
  width: 80px;
  height: 80px;
  border-radius: 16px;
  object-fit: cover;
  background-color: #ddd;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
`;

const TitleSection = styled.div`
  flex: 1;
`;

const Title = styled.h2`
  margin: 0 0 0.5rem 0;
  color: var(--text-color);
  font-size: 1.8rem;
`;

const Description = styled.div`
  color: #64748b;
  font-size: 1rem;
  line-height: 1.5;
`;

const ContentLayout = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background: rgba(255,255,255,0.5);
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.05);
`;

const Tabs = styled.div`
  display: flex;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  padding: 0 1rem;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  color: ${props => props.$active ? 'var(--accent-color)' : '#64748b'};
  font-weight: ${props => props.$active ? 'bold' : 'normal'};
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;
  position: relative;

  &:hover {
    color: var(--accent-color);
  }

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background-color: var(--accent-color);
    transform: scaleX(${props => props.$active ? 1 : 0});
    transition: transform 0.2s ease;
    border-radius: 3px 3px 0 0;
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  animation: ${fadeIn} 0.3s ease-out;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }
`;

const SectionTitle = styled.h3`
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.8rem 0;
  color: #94a3b8;
  font-weight: 700;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #334155;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  
  &:last-child {
    border-bottom: none;
  }
  
  span:first-child {
    color: #64748b;
  }
`;

const BodyText = styled.div`
  font-size: 1rem;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
  
  img {
    max-width: 100%;
    border-radius: 8px;
    margin: 1rem 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  
  a {
    color: var(--accent-color);
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  
  h1, h2, h3 {
    color: #1e293b;
    margin-top: 1.5rem;
  }
  
  code {
    background: #f1f5f9;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9em;
  }
  
  pre {
    background: #1e293b;
    color: #f8fafc;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    code {
      background: none;
      color: inherit;
      padding: 0;
    }
  }
`;

const VersionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

const VersionItem = styled.div`
  padding: 1rem;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-color: var(--accent-color);
  }
`;

const VersionInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const VersionName = styled.div`
  font-weight: bold;
  font-size: 1rem;
  color: #1e293b;
`;

const VersionMeta = styled.div`
  font-size: 0.85rem;
  color: #64748b;
  display: flex;
  gap: 0.8rem;
  align-items: center;
  flex-wrap: wrap;
`;

const MetaGroup = styled.div`
  display: flex;
  gap: 0.3rem;
  align-items: center;
  flex-wrap: wrap;
`;

const Tag = styled.span`
  background: #f1f5f9;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #475569;
  font-weight: 500;
`;

const GameVersionTag = styled(Tag)`
  background: #e0f2fe;
  color: #0369a1;
`;

const LoaderTag = styled(Tag)`
  background: #f0fdf4;
  color: #15803d;
  text-transform: capitalize;
`;

const InstallButton = styled.button`
  padding: 0.6rem 1.2rem;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.2s;

  &:hover {
    background-color: var(--accent-hover);
  }
`;

const DependencyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const DependencyItem = styled.div`
  font-size: 0.85rem;
  padding: 0.6rem;
  background: white;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 6px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  &::before {
    content: '';
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-color);
  }
`;

const DependencyCardContainer = styled.div`
  padding: 0.8rem;
  background: white;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-color: var(--accent-color);
  }
`;

const DependencyIcon = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  background-color: #f1f5f9;
`;

const DependencyInfo = styled.div`
  flex: 1;
  overflow: hidden;
`;

const DependencyTitle = styled.div`
  font-weight: bold;
  font-size: 0.95rem;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DependencyDesc = styled.div`
  font-size: 0.8rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DependencyCard: React.FC<{ projectId: string; onOpen: (project: any) => void }> = ({ projectId, onOpen }) => {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchProject = async () => {
      try {
        const data = await invoke<any>('get_modrinth_project', { projectId });
        if (mounted) setProject(data);
      } catch (e) {
        console.error(`Failed to load dependency ${projectId}`, e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchProject();
    return () => { mounted = false; };
  }, [projectId]);

  if (loading) {
    return (
      <DependencyCardContainer style={{ justifyContent: 'center', padding: '1rem' }}>
        <LoadingSpinner size={20} borderWidth={2} color="var(--accent-color)" />
      </DependencyCardContainer>
    );
  }

  if (!project) return null;

  const handleClick = () => {
    // Map Project to ProjectHit-like structure for ModDetailModal
    const projectHit = {
      project_id: project.id,
      title: project.title,
      description: project.description,
      icon_url: project.icon_url,
      author: 'Unknown', // Team ID is available as project.team, but we don't have author name easily
      follows: project.followers,
      downloads: project.downloads,
      project_type: project.project_type
    };
    onOpen(projectHit);
  };

  return (
    <DependencyCardContainer onClick={handleClick}>
      <DependencyIcon src={project.icon_url || 'https://via.placeholder.com/40'} />
      <DependencyInfo>
        <DependencyTitle>{project.title}</DependencyTitle>
        <DependencyDesc>{project.description}</DependencyDesc>
      </DependencyInfo>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </DependencyCardContainer>
  );
};

interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: { url: string; filename: string; primary: boolean }[];
  dependencies?: {
    project_id?: string;
    dependency_type: string;
  }[];
}

interface Props {
  project: any; // ProjectHit
  filterGameVersion?: string;
  filterLoader?: string;
  onClose: () => void;
  onInstall: (version: ProjectVersion) => void;
  onOpenProject?: (project: any) => void;
  gamePath?: string;
  currentVersion?: string;
  showAlert?: (msg: string) => void;
  onSwitchToGameDownload?: () => void;
}

export const ModDetailModal: React.FC<Props> = ({ 
  project: initialProject, 
  filterGameVersion,
  filterLoader,
  onClose, 
  onInstall,
  onOpenProject,
  gamePath,
  currentVersion,
  showAlert,
  onSwitchToGameDownload
}) => {
  const [fullProject, setFullProject] = useState<any>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'description' | 'download' | 'info'>('download');
  const [showInstallChoice, setShowInstallChoice] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<ProjectVersion | null>(null);

  const handleInstallClick = (v: ProjectVersion) => {
    setPendingVersion(v);
    setShowInstallChoice(true);
  };

  const handleInstallToGame = async () => {
    if (!pendingVersion || !currentVersion) return;
    
    try {
      // Check if version is modded
      const details = await invoke<{ is_modded: boolean }>('get_version_details', { 
          versionId: currentVersion, 
          gamePath: gamePath || null 
      });
      
      if (!details.is_modded) {
          setShowInstallChoice(false);
          const shouldSwitch = await ask(
              `检测到 ${currentVersion} 是原版游戏，无法直接安装模组。\n\n模组需要 Fabric 或 Forge 加载器才能运行。\n是否前往“游戏下载”页面安装加载器？`, 
              { title: '需要加载器', kind: 'warning' }
          );
          
          if (shouldSwitch && onSwitchToGameDownload) {
              onSwitchToGameDownload();
          }
          return;
      }

      setShowInstallChoice(false);
      
      const file = pendingVersion.files.find(f => f.primary) || pendingVersion.files[0];
      if (!file) throw new Error("No file found");

      const savedConfig = localStorage.getItem(`version_config_${currentVersion}`);
      let enableIsolation = false;
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        enableIsolation = config.enableIsolation;
      }

      await invoke('install_mod', {
        url: file.url,
        filename: file.filename,
        versionId: currentVersion,
        gamePath: gamePath || null,
        enableIsolation
      });
      
      if (showAlert) {
        showAlert(`已安装 ${file.filename} 到 ${currentVersion}`);
      } else {
        alert(`已安装 ${file.filename} 到 ${currentVersion}`);
      }
    } catch (e) {
      console.error(e);
      if (showAlert) {
        showAlert(`安装失败: ${e}`);
      } else {
        alert(`安装失败: ${e}`);
      }
    }
  };

  const handleSaveAs = () => {
    if (!pendingVersion) return;
    setShowInstallChoice(false);
    onInstall(pendingVersion);
  };

  useEffect(() => {
    loadData();
  }, [initialProject.project_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projData, versData] = await Promise.all([
        invoke<any>('get_modrinth_project', { projectId: initialProject.project_id }),
        invoke<ProjectVersion[]>('get_modrinth_versions', { 
          projectId: initialProject.project_id,
          loaders: filterLoader ? [filterLoader] : null,
          gameVersions: filterGameVersion ? [filterGameVersion] : null
        })
      ]);
      setFullProject(projData);
      setVersions(versData);
    } catch (e) {
      console.error("Failed to load project details", e);
    } finally {
      setLoading(false);
    }
  };

  const displayVersions = versions;
  const latestVersion = versions[0];
  const dependencies = latestVersion?.dependencies?.filter(d => d.dependency_type === 'required') || [];

  return (
    <ModalOverlay onClick={onClose}>
      <Header onClick={e => e.stopPropagation()}>
        <BackButton onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </BackButton>
        <Title>{initialProject.title}</Title>
      </Header>

      <ModalContent onClick={e => e.stopPropagation()}>
        <ProjectHeader>
          <Icon src={initialProject.icon_url || 'https://via.placeholder.com/64'} />
          <TitleSection>
            <Description>{initialProject.description}</Description>
          </TitleSection>
        </ProjectHeader>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <LoadingSpinner color="var(--accent-color)" />
          </div>
        ) : (
          <ContentLayout>
            <Tabs>
              <Tab 
                $active={activeTab === 'download'} 
                onClick={() => setActiveTab('download')}
              >
                下载
              </Tab>
              <Tab 
                $active={activeTab === 'description'} 
                onClick={() => setActiveTab('description')}
              >
                介绍
              </Tab>
              <Tab 
                $active={activeTab === 'info'} 
                onClick={() => setActiveTab('info')}
              >
                信息
              </Tab>
            </Tabs>

            <TabContent key={activeTab}>
              {activeTab === 'description' && fullProject && (
                 <BodyText>
                   <ReactMarkdown>{fullProject.body}</ReactMarkdown>
                 </BodyText>
              )}

              {activeTab === 'download' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <SectionTitle>前置依赖</SectionTitle>
                    {dependencies.length > 0 ? (
                      <DependencyList>
                        {dependencies.map((d, i) => (
                            d.project_id ? (
                              <DependencyCard 
                                key={d.project_id || i} 
                                projectId={d.project_id} 
                                onOpen={(p) => onOpenProject?.(p)}
                              />
                            ) : (
                              <DependencyItem key={i}>
                                Unknown Dependency
                              </DependencyItem>
                            )
                        ))}
                      </DependencyList>
                    ) : (
                      <div style={{ fontSize: '0.9rem', color: '#94a3b8', fontStyle: 'italic' }}>无必选依赖</div>
                    )}
                  </div>

                  <div>
                    <SectionTitle>版本列表 ({displayVersions.length})</SectionTitle>
                    {displayVersions.length === 0 ? (
                       <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                         没有找到匹配的版本
                       </div>
                    ) : (
                      <VersionList>
                        {displayVersions.map(v => (
                          <VersionItem key={v.id}>
                            <VersionInfo>
                              <VersionName>{v.name}</VersionName>
                              <VersionMeta>
                                <Tag title="Version Number">{v.version_number}</Tag>
                                <MetaGroup>
                                  {v.game_versions.map(gv => <GameVersionTag key={gv}>{gv}</GameVersionTag>)}
                                </MetaGroup>
                                <MetaGroup>
                                  {v.loaders.map(l => <LoaderTag key={l}>{l}</LoaderTag>)}
                                </MetaGroup>
                              </VersionMeta>
                            </VersionInfo>
                            <InstallButton onClick={() => handleInstallClick(v)}>安装</InstallButton>
                          </VersionItem>
                        ))}
                      </VersionList>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'info' && (
                <div>
                  <SectionTitle>基本信息</SectionTitle>
                  <InfoItem>
                    <span>下载量</span>
                    <span>{initialProject.downloads.toLocaleString()}</span>
                  </InfoItem>
                  <InfoItem>
                    <span>关注</span>
                    <span>{initialProject.follows.toLocaleString()}</span>
                  </InfoItem>
                  <InfoItem>
                    <span>作者</span>
                    <span>{initialProject.author}</span>
                  </InfoItem>
                  <InfoItem>
                    <span>更新时间</span>
                    <span>{new Date(fullProject?.updated).toLocaleDateString()}</span>
                  </InfoItem>
                  <InfoItem>
                    <span>许可证</span>
                    <span>{fullProject?.license?.id || 'Unknown'}</span>
                  </InfoItem>
                  <InfoItem>
                    <span>项目 ID</span>
                    <span>{initialProject.project_id}</span>
                  </InfoItem>
                </div>
              )}
            </TabContent>
          </ContentLayout>
        )}
      </ModalContent>

      <ChoiceModal
        isOpen={showInstallChoice}
        onClose={() => setShowInstallChoice(false)}
        onSelect={(id) => {
          if (id === 'install') {
            handleInstallToGame();
          } else if (id === 'save') {
            handleSaveAs();
          }
        }}
        options={[
          ...(currentVersion ? [{
            id: 'install',
            label: `安装到 ${currentVersion}`,
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
              </svg>
            )
          }] : []),
          {
            id: 'save',
            label: '另存为...',
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            )
          }
        ]}
      />
    </ModalOverlay>
  );
};
