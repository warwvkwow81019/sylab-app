import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking, Platform } from 'react-native';
// expo-video dynamically imported to prevent native crash on iOS 26
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';

// Convert HTTP server URLs to HTTPS tunnel URLs to bypass iOS ATS
function normalizeImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/http:\/\/36\.137\.84\.216:9091/g, 'https://s.symsgf.xyz')
    .replace(/http:\/\/127\.0\.0\.1:9091/g, 'https://s.symsgf.xyz')
    .replace(/http:\/\/localhost:9091/g, 'https://s.symsgf.xyz');
}

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
}


const webWrapCSS = Platform.OS === 'web' ? `
  .md-bubble p, .md-bubble li, .md-bubble td, .md-bubble th, .md-bubble h1, .md-bubble h2, .md-bubble h3, .md-bubble blockquote { word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap; }
  .md-bubble p a, .md-bubble p code { word-break: break-all; }
  .md-table-scroll { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
  .md-table-scroll::-webkit-scrollbar { height: 4px; }
  .md-table-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
` : '';

/**
 * 简易 Markdown 渲染器
 * 支持：标题、粗体、斜体、代码块、行内代码、列表、引用、链接
 */

// Error boundary for video player to prevent native crashes
class VideoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ marginVertical: 8, padding: 16, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 13 }}>视频加载失败</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// Inline video player component - dynamic import to prevent native crash on page load
function VideoPlayerInline({ src, videoKey }: { src: string; videoKey: string }) {
  const [videoModule, setVideoModule] = React.useState<{ useVideoPlayer: any; VideoView: any } | null>(null);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    if (!src || Platform.OS === 'web') return;
    let mounted = true;
    import('expo-video').then(mod => {
      if (mounted) setVideoModule({ useVideoPlayer: mod.useVideoPlayer, VideoView: mod.VideoView });
    }).catch(() => {
      if (mounted) setLoadError(true);
    });
    return () => { mounted = false; };
  }, [src]);

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginVertical: 8, borderRadius: 12, overflow: 'hidden' }}>
        <video src={src} controls style={{ width: '100%', maxWidth: 480, borderRadius: 12, backgroundColor: '#000' }} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={{ marginVertical: 8, padding: 20, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#6b7280', fontSize: 13 }}>视频播放不可用</Text>
      </View>
    );
  }
  if (!videoModule) {
    return (
      <View style={{ marginVertical: 8, padding: 20, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 13 }}>加载视频...</Text>
      </View>
    );
  }
  return (
    <VideoErrorBoundary>
      <NativeVideoInline src={src} useVideoPlayer={videoModule.useVideoPlayer} VideoView={videoModule.VideoView} />
    </VideoErrorBoundary>
  );
}

function NativeVideoInline({ src, useVideoPlayer, VideoView }: { src: string; useVideoPlayer: any; VideoView: any }) {
  const player = useVideoPlayer(src, (p: any) => { p.loop = false; });
  return (
    <View style={{ marginVertical: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: '100%', height: 200, borderRadius: 12 }} contentFit="contain" allowsFullscreen allowsPictureInPicture />
    </View>
  );
}


export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isDark }) => {
  // Decode URL-encoded content from AI
  const decodedContent = (() => {
    try { return decodeURIComponent(content || ''); } catch { return content || ''; }
  })();
  const lines = decodedContent.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';
  let inList = false;

  const textColor = isDark ? Colors.textInverse : Colors.text;
  const codeBg = isDark ? '#1e1e1e' : '#f5f5f5';

  const renderInline = (text: string, key: string): React.ReactNode => {
    // 行内代码
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={`${key}-code-${i}`} style={[styles.inlineCode, { backgroundColor: codeBg, color: isDark ? '#d4d4d4' : '#334155' }]}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      // 粗体
      let result: React.ReactNode = part;
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      if (boldParts.length > 1) {
        result = boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <Text key={`${key}-b-${j}`} style={{ fontWeight: '700' }}>{bp.slice(2, -2)}</Text>;
          }
          // 斜体
          const italicParts = bp.split(/(\*[^*]+\*)/g);
          if (italicParts.length > 1) {
            return italicParts.map((ip, k) => {
              if (ip.startsWith('*') && ip.endsWith('*')) {
                return <Text key={`${key}-i-${j}-${k}`} style={{ fontStyle: 'italic' }}>{ip.slice(1, -1)}</Text>;
              }
              return <Text key={`${key}-t-${j}-${k}`}>{ip}</Text>;
            });
          }
          return <Text key={`${key}-t-${j}`}>{bp}</Text>;
        });
      }
      return <React.Fragment key={`${key}-${i}`}>{result}</React.Fragment>;
    });
  };

  
// Parse <img src="..."> tags and render as Image
const renderImgTag = (tag: string, key: string): React.ReactNode => {
  const srcMatch = tag.match(/src=["']([^"']+)["']/);
  if (!srcMatch) return null;
  const src = srcMatch[1];
  const altMatch = tag.match(/alt=["']([^"']+)["']/);
  const alt = altMatch ? altMatch[1] : '';
  return (
    <View key={key} style={[styles.imgContainer]}>
      <Image source={{ uri: normalizeImageUrl(src) }} style={styles.img} resizeMode="cover" />
      {alt ? <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>{alt}</Text> : null}
    </View>
  );
};

// Parse <video ...> or <source ...> tags and render as video player
const renderVideoTag = (tag: string, key: string): React.ReactNode => {
  let src = '';
  const srcMatch = tag.match(/<video[^>]*src=["']([^"']+)["']/);
  if (srcMatch) {
    src = srcMatch[1];
  } else {
    const sourceMatch = tag.match(/<source[^>]*src=["']([^"']+)["']/);
    if (sourceMatch) src = sourceMatch[1];
  }
  if (!src) return null;
  return (
    <View key={key} style={[styles.videoContainer]}>
      <TouchableOpacity style={[styles.videoLink]} activeOpacity={0.7} onPress={() => Linking.openURL(src)}>
        <Text style={{ color: '#fff', fontSize: FontSize.sm }}>▶</Text>
        <Text style={[styles.videoLinkText]}>点击播放视频</Text>
        <Text style={{ color: '#94a3b8', fontSize: 11, flex: 1, marginLeft: 8 }} numberOfLines={1}>{src.substring(0, 60)}...</Text>
      </TouchableOpacity>
    </View>
  );
};

// Replace raw HTML img/video tags in text with placeholders
const extractHtmlTags = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  // Handle markdown images ![alt](url) by converting to <img> tags
  const mdImgConverted = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  const imgRegex = /<img[^>]+>/gi;
  const videoRegex = /<video[^>]*>[\s\S]*?<\/video>|<video[^>]+>/gi;
  let lastIndex = 0;
  let keyIdx = 0;
  // Process images first
  let remaining = mdImgConverted;
  const segments: { type: string; content: string; start: number; end: number }[] = [];
  let tmp = mdImgConverted;
  let offset = 0;
  imgRegex.lastIndex = 0;
  videoRegex.lastIndex = 0;
  // Combine all matches
  const allMatches: { type: string; content: string; index: number }[] = [];
  let m;
  const imgRe = /<img[^>]+>/gi;
  while ((m = imgRe.exec(mdImgConverted)) !== null) { allMatches.push({ type: 'img', content: m[0], index: m.index }); }
  const vidRe = /<video[^>]*>[\s\S]*?<\/video>|<video[^>]+>/gi;
  while ((m = vidRe.exec(mdImgConverted)) !== null) { allMatches.push({ type: 'video', content: m[0], index: m.index }); }
  allMatches.sort((a, b) => a.index - b.index);
  let pos = 0;
  for (const match of allMatches) {
    if (match.index > pos) {
      parts.push(mdImgConverted.slice(pos, match.index) as any);  // raw string for caller to format
    }
    if (match.type === 'img') parts.push(renderImgTag(match.content, `img-${keyIdx++}`));
    else parts.push(renderVideoTag(match.content, `vid-${keyIdx++}`));
    pos = match.index + match.content.length;
  }
  if (pos < text.length) parts.push(text.slice(pos) as any);  // raw string for caller to format
  return parts.length > 0 ? parts : null;
};


/**
 * Check if a line is a table separator row
 */
const isTableSeparator = (line: string): boolean => {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());
};

/**
 * Parse a table separator to extract column alignments
 */
const parseAlignments = (line: string): ('left' | 'center' | 'right')[] => {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  return cells.map(cell => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
    if (trimmed.endsWith(':')) return 'right';
    return 'left';
  });
};

/**
 * Parse a table row into cells
 */
const parseTableCells = (line: string): string[] => {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(cell => cell.trim());
};

/**
 * Render a Markdown table from consecutive lines
 */
const renderTable = (headerLine: string, lines: string[], startIdx: number, isDark: boolean): { element: React.ReactNode; consumed: number } => {
  if (startIdx + 1 >= lines.length) return { element: null, consumed: 0 };
  const sepLine = lines[startIdx + 1];
  if (!isTableSeparator(sepLine)) return { element: null, consumed: 0 };

  const alignments = parseAlignments(sepLine);
  const headers = parseTableCells(headerLine);
  const textColor = isDark ? Colors.textInverse : Colors.text;
  const headerBg = isDark ? '#2d3748' : '#f7f7f5';
  const borderColor = isDark ? '#4a5568' : '#e2e8f0';

  const dataRows: string[][] = [];
  let consumed = 2;
  for (let j = startIdx + 2; j < lines.length; j++) {
    const row = lines[j].trim();
    if (row === '' || !row.includes('|')) break;
    dataRows.push(parseTableCells(row));
    consumed++;
  }


  return {
    element: (
      Platform.OS === 'web' ? (
        <View key={`table-${startIdx}`} className="md-table-scroll" style={{ marginVertical: Spacing.sm }}>
          <View style={{ borderWidth: 1, borderColor, borderRadius: BorderRadius.md, overflow: 'hidden', flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: headerBg, borderBottomWidth: 1, borderBottomColor: borderColor }}>
              {headers.map((cell, ci) => (
                <View key={`th-${ci}`} style={{ minWidth: 140, paddingHorizontal: 12, alignItems: alignments[ci] === 'center' ? 'center' : alignments[ci] === 'right' ? 'flex-end' : 'flex-start' }}>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: textColor, flex: 1, flexWrap: 'wrap' }}>{renderInline(cell, `th-${ci}`)}</Text>
                </View>
              ))}
            </View>
            {dataRows.map((row, ri) => (
              <View key={`tr-${ri}`} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: ri < dataRows.length - 1 ? 0.5 : 0, borderBottomColor: borderColor }}>
                {row.map((cell, ci) => (
                  <View key={`td-${ri}-${ci}`} style={{ minWidth: 140, paddingHorizontal: 12, alignItems: alignments[ci] === 'center' ? 'center' : alignments[ci] === 'right' ? 'flex-end' : 'flex-start' }}>
                    <Text style={{ fontSize: FontSize.sm, color: textColor, flex: 1, flexWrap: 'wrap' }}>{renderInline(cell, `td-${ri}-${ci}`)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View key={`table-wrap-${startIdx}`} style={{ marginVertical: Spacing.sm }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          directionalLockEnabled
          alwaysBounceHorizontal={false}
          style={{ alignSelf: 'flex-start', maxWidth: '100%', flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ flexGrow: 0, flexShrink: 0 }}
        >
          <View style={{ borderWidth: 1, borderColor, borderRadius: BorderRadius.md, overflow: 'hidden', flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: headerBg, borderBottomWidth: 1, borderBottomColor: borderColor }}>
              {headers.map((cell, ci) => (
                <View key={`th-${ci}`} style={{ minWidth: 200, maxWidth: 360, paddingHorizontal: 12, flexShrink: 0, flexGrow: 0 }}>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: textColor, flexWrap: 'wrap', width: '100%' }}>{renderInline(cell, `th-${ci}`)}</Text>
                </View>
              ))}
            </View>
            {dataRows.map((row, ri) => (
              <View key={`tr-${ri}`} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: ri < dataRows.length - 1 ? 0.5 : 0, borderBottomColor: borderColor }}>
                {row.map((cell, ci) => (
                  <View key={`td-${ri}-${ci}`} style={{ minWidth: 200, maxWidth: 360, paddingHorizontal: 12, flexShrink: 0, flexGrow: 0 }}>
                    <Text style={{ fontSize: FontSize.sm, color: textColor, flexWrap: 'wrap', width: '100%' }}>{renderInline(cell, `td-${ri}-${ci}`)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        </View>
      )
    ),
    consumed,
  };
};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeContent = '';
      } else {
        inCodeBlock = false;
        elements.push(
          <View key={`code-${i}`} style={[styles.codeBlock, { backgroundColor: codeBg }]}>
            {codeLang ? <Text style={[styles.codeLang, { color: isDark ? '#9b9b9b' : Colors.textSecondary }]}>{codeLang}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[styles.codeText, { color: isDark ? '#dcdcdc' : '#333' }]} selectable>{codeContent}</Text>
            </ScrollView>
          </View>
        );
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    // 表格检测
    if (line.trim().includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableResult = renderTable(line, lines, i, !!isDark);
      if (tableResult.element) {
        elements.push(tableResult.element);
        i += tableResult.consumed - 1;
        continue;
      }
    }

    // 空行
    if (line.trim() === '') {
      elements.push(<View key={`sp-${i}`} style={{ height: 2 }} />);
      continue;
    }

    // 标题
    if (line.startsWith('### ')) {
      elements.push(<Text key={`h3-${i}`} style={[styles.h3, { color: textColor }]}>{renderInline(line.slice(4), `h3-${i}`)}</Text>);
    } else if (line.startsWith('## ')) {
      elements.push(<Text key={`h2-${i}`} style={[styles.h2, { color: textColor }]}>{renderInline(line.slice(3), `h2-${i}`)}</Text>);
    } else if (line.startsWith('# ')) {
      elements.push(<Text key={`h1-${i}`} style={[styles.h1, { color: textColor }]}>{renderInline(line.slice(2), `h1-${i}`)}</Text>);
    }
    // 引用
    else if (line.startsWith('> ')) {
      elements.push(
        <View key={`q-${i}`} style={[styles.quote, { borderLeftColor: Colors.primary }]}>
          <Text style={[styles.quoteText, { color: isDark ? '#999' : Colors.textSecondary }]}>{renderInline(line.slice(2), `q-${i}`)}</Text>
        </View>
      );
    }
    // 无序列表
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { inList = true; }
      elements.push(
        <View key={`li-${i}`} style={styles.listItem}>
          <Text style={{ color: textColor, fontSize: FontSize.md, width: 16 }}></Text>
          <Text style={{ color: textColor, fontSize: FontSize.md, flex: 1 }}>{renderInline(line.slice(2), `li-${i}`)}</Text>
        </View>
      );
    }
    // 有序列表
    else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <View key={`ol-${i}`} style={styles.listItem}>
            <Text style={{ color: Colors.primary, fontSize: FontSize.md, fontWeight: '600', width: 24 }}>{match[1]}.</Text>
            <Text style={{ color: textColor, fontSize: FontSize.md, flex: 1 }}>{renderInline(match[2], `ol-${i}`)}</Text>
          </View>
        );
      }
    }
    // Markdown 图片 ![alt](url)
    else if (/^!\[([^\]]*)\]\(([^)]+)\)/i.test(line.trim())) {
      const mdImgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (mdImgMatch) {
        const alt = mdImgMatch[1] || '';
        const src = mdImgMatch[2];
        elements.push(
          <View key={`md-img-${i}`} style={[styles.imgContainer]}>
            <Image source={{ uri: normalizeImageUrl(src) }} style={styles.img} resizeMode="cover" />
            {alt ? <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>{alt}</Text> : null}
          </View>
        );
      }
    }
    // 视频URL检测
    else if (/^https?:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(line.trim())) {
      elements.push(<VideoPlayerInline key={`vid-url-${i}`} src={line.trim()} videoKey={`vid-url-${i}`} />);
    }
    // 普通文本
    else {
      inList = false;
      // Check for standalone img/video tags
      if (/^<img[^>]+>/i.test(line.trim()) || /^&lt;img[^&]+&gt;/i.test(line.trim()) || /^%3Cimg[^%]+%3E/i.test(line.trim())) {
        // Collect multi-line img tags
        let imgLine = line.trim();
        while (!imgLine.includes('>') && !imgLine.includes('%3E') && i + 1 < lines.length) {
          i++;
          imgLine += ' ' + lines[i].trim();
        }
        elements.push(renderImgTag(imgLine, `img-line-${i}`));
      } else if (/<video[^>]*>[\s\S]*?<\/video>|<video[^>]+>/i.test(line.trim())) {
        elements.push(renderVideoTag(line.trim(), `vid-line-${i}`));
      } else {
        // Check inline img/video tags within text
        const inlineParts = extractHtmlTags(line);
        if (inlineParts) {
          // Use View wrapper so Image/View children render correctly on Web
          // (Image inside <Text> renders as <div> inside <span> = broken layout)
          elements.push(
            <View key={`p-${i}`} style={{ marginBottom: Spacing.xs }}>
              {inlineParts.map((part, pIdx) => {
                // Raw string → apply inline formatting (bold/italic/code)
                if (typeof part === 'string') {
                  return <Text key={`pt-${pIdx}`} style={[styles.paragraph, { color: textColor }]}>{renderInline(part, `ip-${i}-${pIdx}`)}</Text>;
                }
                // React element (View with Image) → render directly
                return <React.Fragment key={`pv-${pIdx}`}>{part}</React.Fragment>;
              })}
            </View>
          );
        } else {
          elements.push(<Text key={`p-${i}`} style={[styles.paragraph, { color: textColor }]}>{renderInline(line, `p-${i}`)}</Text>);
        }
      }
    }
  }

  return (
    <>
      {Platform.OS === 'web' && <style>{webWrapCSS}</style>}
      <View style={styles.container} className="md-bubble">{elements}</View>
    </>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: Spacing.xs },
  imgContainer: { marginVertical: Spacing.sm, borderRadius: BorderRadius.md, overflow: 'hidden' },
  img: { width: '100%', height: 220, borderRadius: BorderRadius.md, backgroundColor: '#f0f0f0' },
  videoContainer: { marginVertical: Spacing.sm, borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: '#000' },
  videoPlayer: { width: '100%', height: 220, borderRadius: BorderRadius.md },
  videoLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: '#1e293b', borderRadius: BorderRadius.md, marginVertical: Spacing.sm },
  videoLinkText: { color: '#60a5fa', fontSize: FontSize.sm, marginLeft: Spacing.xs },
  h1: { fontSize: FontSize.xxl, fontWeight: '700', marginBottom: Spacing.sm },
  h2: { fontSize: FontSize.xl, fontWeight: '700', marginBottom: Spacing.sm },
  h3: { fontSize: FontSize.lg, fontWeight: '600', marginBottom: Spacing.xs },
  paragraph: { fontSize: FontSize.md, lineHeight: FontSize.md * 1.4, marginBottom: 2 },
  codeBlock: { borderRadius: BorderRadius.md, padding: Spacing.md, marginVertical: Spacing.sm },
  codeLang: { fontSize: FontSize.xs, marginBottom: Spacing.xs, fontFamily: 'monospace' },
  codeText: { fontSize: FontSize.sm, fontFamily: 'monospace', lineHeight: FontSize.sm * 1.5 },
  inlineCode: { paddingHorizontal: Spacing.xs, paddingVertical: 2, borderRadius: BorderRadius.sm, fontSize: FontSize.sm * 0.9, fontFamily: 'monospace' },
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.md, marginVertical: Spacing.xs },
  quoteText: { fontSize: FontSize.md, fontStyle: 'italic' },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.xs },
});

