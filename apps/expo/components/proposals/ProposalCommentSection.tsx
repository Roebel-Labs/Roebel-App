import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useActiveProfileImage } from '@/hooks/useActiveProfileImage';
import {
  fetchProposalComments,
  deleteProposalComment,
  type ProposalCommentRecord,
} from '@/lib/supabase-proposal-comments';
import ProposalCommentItem from './ProposalCommentItem';
import ProposalCommentComposer from './ProposalCommentComposer';

const MAX_HIGHLIGHT_PAGES = 5;

type Props = {
  proposalId: string;
  isCitizen: boolean;
  /** Optional id of a comment to scroll to and visually highlight. */
  highlightCommentId?: string;
  /** Parent ScrollView ref so the highlighted item can scroll itself into view. */
  scrollViewRef?: RefObject<ScrollView | null>;
};

export type ProposalCommentSectionHandle = {
  refresh: () => void;
  prepend: (comment: ProposalCommentRecord) => void;
};

const ProposalCommentSection = forwardRef<ProposalCommentSectionHandle, Props>(
  function ProposalCommentSection({ proposalId, isCitizen, highlightCommentId, scrollViewRef }, ref) {
    const { colors } = useTheme();
    const { user } = useUser();
    const activeProfileImage = useActiveProfileImage();

    const [comments, setComments] = useState<ProposalCommentRecord[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [composerVisible, setComposerVisible] = useState(false);

    const load = useCallback(
      async (pageNum: number, append: boolean = false) => {
        if (pageNum === 0) setLoading(true);
        else setLoadingMore(true);

        const result = await fetchProposalComments(proposalId, pageNum, user?.wallet_address);

        if (append) {
          setComments((prev) => [...prev, ...result.data]);
        } else {
          setComments(result.data);
        }
        setHasMore(result.hasMore);

        if (pageNum === 0) setLoading(false);
        else setLoadingMore(false);
      },
      [proposalId, user?.wallet_address],
    );

    useEffect(() => {
      setPage(0);
      load(0);
    }, [load]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: () => {
          setPage(0);
          load(0);
        },
        prepend: (comment: ProposalCommentRecord) => {
          setComments((prev) => [comment, ...prev]);
        },
      }),
      [load],
    );

    // Page through comments until the highlighted one shows up (or give up).
    useEffect(() => {
      if (!highlightCommentId || loading || loadingMore) return;
      if (comments.some((c) => c.id === highlightCommentId)) return;
      if (!hasMore || page >= MAX_HIGHLIGHT_PAGES - 1) return;
      const nextPage = page + 1;
      setPage(nextPage);
      load(nextPage, true);
    }, [highlightCommentId, comments, hasMore, loading, loadingMore, page, load]);

    const handleLoadMore = () => {
      const nextPage = page + 1;
      setPage(nextPage);
      load(nextPage, true);
    };

    // Optimistic insert: the composer returns the created record so it appears
    // at the top instantly (no reload), matching the experiences UX.
    const handleCreated = (created: ProposalCommentRecord) => {
      setComments((prev) => [created, ...prev]);
    };

    const handleDelete = async (comment: ProposalCommentRecord) => {
      const walletAddress = user?.wallet_address;
      if (!walletAddress) return;
      if (comment.wallet_address?.toLowerCase() !== walletAddress.toLowerCase()) return;
      try {
        await deleteProposalComment(comment.id, walletAddress);
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
      } catch (e) {
        console.error('[ProposalCommentSection.handleDelete]', e);
      }
    };

    const canCompose = !!user && isCitizen;

    return (
      <View style={styles.section}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Diskussion</Text>
            {comments.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.countText, { color: colors.primary }]}>{comments.length}</Text>
              </View>
            )}
          </View>
        </View>

        {canCompose ? (
          <Pressable
            onPress={() => setComposerVisible(true)}
            style={[styles.trigger, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityRole="button"
            accessibilityLabel="Kommentar schreiben"
          >
            {activeProfileImage.url ? (
              <Image source={{ uri: activeProfileImage.url }} style={styles.triggerAvatar} />
            ) : (
              <View style={[styles.triggerAvatarFallback, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.triggerAvatarText, { color: colors.primary }]}>
                  {activeProfileImage.fallbackInitial}
                </Text>
              </View>
            )}
            <Text style={[styles.triggerPlaceholder, { color: colors.textTertiary }]}>
              Was denkst du über diesen Vorschlag?
            </Text>
            <Ionicons name="chatbubble-outline" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <View style={[styles.gateBar, { borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
            <Text style={[styles.gateText, { color: colors.textSecondary }]}>
              Nur verifizierte Bürger können kommentieren
            </Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {!loading && comments.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              Noch keine Kommentare
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Sei der/die Erste und teile deine Meinung!
            </Text>
          </View>
        )}

        {!loading && comments.length > 0 && (
          <View style={styles.list}>
            {comments.map((comment) => (
              <ProposalCommentItem
                key={comment.id}
                comment={comment}
                isOwner={user?.wallet_address === comment.wallet_address}
                walletAddress={user?.wallet_address}
                onDelete={handleDelete}
                isHighlighted={comment.id === highlightCommentId}
                scrollViewRef={scrollViewRef}
              />
            ))}
          </View>
        )}

        {hasMore && !loadingMore && (
          <Pressable onPress={handleLoadMore} style={styles.loadMoreButton}>
            <Text style={[styles.loadMoreText, { color: colors.primary }]}>Mehr laden</Text>
          </Pressable>
        )}
        {loadingMore && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMore} />
        )}

        {canCompose && (
          <ProposalCommentComposer
            visible={composerVisible}
            onClose={() => setComposerVisible(false)}
            proposalId={proposalId}
            walletAddress={user!.wallet_address}
            onCommentCreated={handleCreated}
          />
        )}
      </View>
    );
  },
);

export default ProposalCommentSection;

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  triggerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  triggerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerAvatarText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  triggerPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  gateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  gateText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  list: {
    gap: 0,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  loadingMore: {
    paddingVertical: 12,
  },
});
